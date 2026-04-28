
// Opcodes
const MGMT_OP_READ = 0;
const MGMT_OP_READ_RSP = 1;
const MGMT_OP_WRITE = 2;
const MGMT_OP_WRITE_RSP = 3;

// Groups
const MGMT_GROUP_ID_OS = 0;
const MGMT_GROUP_ID_IMAGE = 1;
const MGMT_GROUP_ID_STAT = 2;
const MGMT_GROUP_ID_CONFIG = 3;
const MGMT_GROUP_ID_LOG = 4;
const MGMT_GROUP_ID_CRASH = 5;
const MGMT_GROUP_ID_SPLIT = 6;
const MGMT_GROUP_ID_RUN = 7;
const MGMT_GROUP_ID_FS = 8;
const MGMT_GROUP_ID_SHELL = 9;

// OS group
const OS_MGMT_ID_ECHO = 0;
const OS_MGMT_ID_CONS_ECHO_CTRL = 1;
const OS_MGMT_ID_TASKSTAT = 2;
const OS_MGMT_ID_MPSTAT = 3;
const OS_MGMT_ID_DATETIME_STR = 4;
const OS_MGMT_ID_RESET = 5;

// Image group
const IMG_MGMT_ID_STATE = 0;
const IMG_MGMT_ID_UPLOAD = 1;
const IMG_MGMT_ID_FILE = 2;
const IMG_MGMT_ID_CORELIST = 3;
const IMG_MGMT_ID_CORELOAD = 4;
const IMG_MGMT_ID_ERASE = 5;

// Transport types
const TRANSPORT_BLUETOOTH = 'bluetooth';
const TRANSPORT_SERIAL = 'serial';

// SMP protocol versions
const SMP_VERSION_1 = 0;
const SMP_VERSION_2 = 1;

/**
 * Port of Zephyr's crc16_itu_t()
 * @param {number} seed - 16-bit CRC seed value
 * @param {Uint8Array|Array} data - array-like sequence of 8-bit data values
 * @returns {number} Checksum of data using polynomial 0x1021
 */
function crc16ITUT(seed, data) {
    seed &= 0xFFFF;
    for (const byte of data) {
        seed = ((seed >> 8) | (seed << 8)) & 0xFFFF;
        seed ^= (byte & 0xFF);
        seed ^= (seed & 0xFF) >> 4;
        seed = seed ^ ((seed << 12) & 0xFFFF);
        seed ^= (seed & 0xFF) << 5;
    }
    return seed;
}

/**
 * Transformer that expects Uint8Array chunks as input and outputs
 * Uint8Arrays of lines delimited by 0x0A (\n), including the
 * terminating newline.
 *
 * The mcumgr spec says nothing about carriage returns (\r), but at
 * least one implementation terminates its lines with \n\r, so we
 * must be careful to properly trim all line endings.
 */
class LineTransformer {
    constructor() {
        this._chunks = [];
        this._length = 0;
    }

    transform(chunk, controller) {
        // Handle lines ended by this chunk
        let index = chunk.indexOf(0x0A);
        let start = 0;
        while (index !== -1) {
            // Complete a line using previously stored chunks and the start of this chunk
            const lineBuffer = new Uint8Array(this._length + index + 1 - start);
            let offset = 0;
            for (const storedChunk of this._chunks) {
                lineBuffer.set(storedChunk, offset);
                offset += storedChunk.length;
            }
            lineBuffer.set(chunk.subarray(start, index + 1), offset);

            // Trim carriage returns at the beginning or end of the line
            let trimmedStart = 0;
            let trimmedEnd = lineBuffer.length;
            for (let i = 0; i < lineBuffer.length; i++) {
                if (lineBuffer[i] === 0x0D) {
                    trimmedStart++;
                } else {
                    break;
                }
            }
            for (let i = lineBuffer.length - 1; i >= 0; i--) {
                if (lineBuffer[i] === 0x0D) {
                    trimmedEnd--;
                } else {
                    break;
                }
            }

            // Output the trimmed line for downstream processing
            if (trimmedStart !== 0 || trimmedEnd !== lineBuffer.length) {
                controller.enqueue(lineBuffer.slice(trimmedStart, trimmedEnd));
            } else {
                controller.enqueue(lineBuffer);
            }

            // Clear stored chunks and keep searching
            this._chunks = [];
            this._length = 0;

            // Continue searching this chunk for more lines
            start = index + 1;
            index = chunk.indexOf(0x0A, start);
        }

        // Store any remaining bytes from the chunk for later lines
        if (start === 0) {
            // No newline in this chunk at all
            this._chunks.push(chunk);
            this._length += chunk.length;
        } else if (start < chunk.length) {
            // At least one byte remaining after processing newlines
            this._chunks.push(chunk.slice(start));
            this._length += chunk.length - start;
        }
    }
}

/**
 * Transformer that expects complete lines as Uint8Arrays as input,
 * extracts the lines that contain mcumgr frames, reassembles them
 * and outputs complete mcumgr packets.
 */
class ConsoleDeframerTransformer {
    constructor() {
        this._frameBodies = [];
        this._numDecodedBytes = 0;
        this._numExpectedBytes = 0;
    }

    transform(chunk, controller) {
        if (chunk.length < 7) {
            // Need at least the frame header, base64-encoded body, and newline
            return;
        }

        let newPacket = false;
        if (chunk[0] === 0x06 && chunk[1] === 0x09) {
            // Initial frame of a new packet
            if (this._numExpectedBytes !== 0) {
                // console.log(`Discarding partial packet due to new start frame`);
            }
            // Discard any existing state
            this._frameBodies = [];
            this._numDecodedBytes = 0;
            this._numExpectedBytes = 0;
            newPacket = true;
        } else if (chunk[0] === 0x04 && chunk[1] === 0x14) {
            // Continuation frame of an existing packet
            if (this._numDecodedBytes === this._numExpectedBytes) {
                // We don't have the beginning of this packet
                // Discard continuation frames until we get a new packet
                return;
            }
        } else {
            // Not an mcumgr frame
            return;
        }

        // Decode the frame body from base64
        const frameBodyBase64 = String.fromCharCode.apply(null, chunk.subarray(2, chunk.length - 1));
        const frameBodyString = atob(frameBodyBase64);
        const frameBody = new Uint8Array(frameBodyString.length);
        for (let i = 0; i < frameBodyString.length; i++) {
            frameBody[i] = frameBodyString.charCodeAt(i);
        }

        if (newPacket) {
            const view = new DataView(frameBody.buffer);
            // Read the number of decoded bytes expected, excluding the
            // 16-bit length, but including the 16-bit CRC.
            const packetLength = view.getUint16(0, false);
            // Overall, we expect 2 bytes for the packet length plus the
            // self-reported packet length.
            this._numExpectedBytes = packetLength + 2;
            this._numDecodedBytes = frameBody.length;
            this._frameBodies.push(frameBody);
        } else {
            // Append the frame body for reassembly
            this._frameBodies.push(frameBody);
            this._numDecodedBytes += frameBody.length;
        }

        // Check if we have enough data to reassemble the packet
        if (this._numDecodedBytes === this._numExpectedBytes) {
            // Merge all of the frame bodies together into the whole packet
            // plus the packet length header and CRC16 trailer
            const packetBuffer = new Uint8Array(this._numDecodedBytes);
            let offset = 0;
            for (const body of this._frameBodies) {
                packetBuffer.set(body, offset);
                offset += body.length;
            }

            const view = new DataView(packetBuffer.buffer);
            const embeddedCrc16 = view.getUint16(packetBuffer.length - 2, false);
            const packet = packetBuffer.subarray(2, packetBuffer.length - 2);
            const calculatedCrc16 = crc16ITUT(0x0000, packet);

            if (calculatedCrc16 !== embeddedCrc16) {
                // CRC mismatch - discard packet
                // console.log(`CRC mismatch - expected ${embeddedCrc16}, got ${calculatedCrc16}`);
            } else {
                // Output the packet body
                controller.enqueue(packetBuffer.subarray(2, packetBuffer.length - 2));
            }

            // Reset state
            this._frameBodies = [];
            this._numDecodedBytes = 0;
            this._numExpectedBytes = 0;
        } else if (this._numDecodedBytes > this._numExpectedBytes) {
            // Got too many bytes; discard and start over
            this._frameBodies = [];
            this._numDecodedBytes = 0;
            this._numExpectedBytes = 0;
        }
    }
}

/**
 * Base class for MCU Manager transports.
 * Provides common callback registration and state management.
 */
class MCUTransport {
    constructor(di = {}) {
        this._logger = di.logger || { info: console.log, error: console.error };
        this._userRequestedDisconnect = false;
        this._connectCallback = null;
        this._connectingCallback = null;
        this._disconnectCallback = null;
        this._rawMessageCallback = null;
    }

    onConnecting(callback) {
        this._connectingCallback = callback;
        return this;
    }

    onConnect(callback) {
        this._connectCallback = callback;
        return this;
    }

    onDisconnect(callback) {
        this._disconnectCallback = callback;
        return this;
    }

    onRawMessage(callback) {
        this._rawMessageCallback = callback;
        return this;
    }

    async disconnect() {
        this._userRequestedDisconnect = true;
    }

    async _connected() {
        if (this._connectCallback) await this._connectCallback();
    }

    async _disconnected(error = null) {
        this._logger.info('Disconnected.');
        if (this._disconnectCallback) this._disconnectCallback(error);
        this._userRequestedDisconnect = false;
    }

    _connecting() {
        if (this._connectingCallback) this._connectingCallback();
    }

    _rawMessage(message) {
        if (this._rawMessageCallback) this._rawMessageCallback(message);
    }

    get smpVersion() {
        return SMP_VERSION_1;
    }

    // Abstract methods - must be implemented by subclasses
    async connect(filters) {
        throw new Error('connect() must be implemented by subclass');
    }

    async sendMessage(data) {
        throw new Error('sendMessage() must be implemented by subclass');
    }

    get name() {
        throw new Error('name getter must be implemented by subclass');
    }
}

/**
 * Bluetooth Low Energy transport for MCU Manager.
 * Uses Web Bluetooth API for communication.
 */
class MCUTransportBluetooth extends MCUTransport {
    constructor(di = {}) {
        super(di);
        this.SERVICE_UUID = '8d53dc1d-1db7-4cd3-868b-8a527460aa84';
        this.CHARACTERISTIC_UUID = 'da2e7828-fbce-4e01-ae9e-261174997c48';
        this._device = null;
        this._service = null;
        this._characteristic = null;
        this._buffer = new Uint8Array();
        this._reconnectDelay = di.reconnectDelay || 1000;
    }

    async _requestDevice(filters) {
        const params = {
            acceptAllDevices: true,
            optionalServices: [this.SERVICE_UUID]
        };
        if (filters) {
            params.filters = filters;
            params.acceptAllDevices = false;
        }
        return navigator.bluetooth.requestDevice(params);
    }

    async connect(filters) {
        try {
            this._device = await this._requestDevice(filters);
            this._logger.info(`Connecting to device ${this.name}...`);
            this._device.addEventListener('gattserverdisconnected', async event => {
                this._logger.info(event);
                if (!this._userRequestedDisconnect) {
                    this._logger.info('Trying to reconnect');
                    this._connectInternal(this._reconnectDelay);
                } else {
                    this._disconnected();
                }
            });
            this._connectInternal(0);
        } catch (error) {
            this._logger.error(error);
            await this._disconnected(error);
            return;
        }
    }

    _connectInternal(delay = 1000) {
        setTimeout(async () => {
            try {
                this._connecting();
                const server = await this._device.gatt.connect();
                this._logger.info(`Server connected.`);
                this._service = await server.getPrimaryService(this.SERVICE_UUID);
                this._logger.info(`Service connected.`);
                this._characteristic = await this._service.getCharacteristic(this.CHARACTERISTIC_UUID);
                this._characteristic.addEventListener('characteristicvaluechanged', this._notification.bind(this));
                await this._characteristic.startNotifications();
                await this._connected();
            } catch (error) {
                this._logger.error(error);
                // Only show error to user on initial connection attempt, not on reconnection attempts
                await this._disconnected(delay === 0 ? error : null);
            }
        }, delay);
    }

    async disconnect() {
        await super.disconnect();
        if (this._device && this._device.gatt) {
            await this._device.gatt.disconnect();
        }
    }

    async _disconnected(error = null) {
        await super._disconnected(error);
        this._device = null;
        this._service = null;
        this._characteristic = null;
        this._buffer = new Uint8Array();
    }

    async sendMessage(data) {
        return await this._characteristic.writeValueWithoutResponse(data);
    }

    _notification(event) {
        const message = new Uint8Array(event.target.value.buffer);
        this._buffer = new Uint8Array([...this._buffer, ...message]);
        const messageLength = this._buffer[2] * 256 + this._buffer[3];
        if (this._buffer.length < messageLength + 8) return;
        this._rawMessage(this._buffer.slice(0, messageLength + 8));
        this._buffer = this._buffer.slice(messageLength + 8);
    }

    get name() {
        return this._device && this._device.name;
    }
}

/**
 * Serial port transport for MCU Manager.
 * Uses Web Serial API for communication with mcumgr console framing.
 * Based on work by devanlai: https://github.com/devanlai/mcumgr-web/tree/serial
 */
class MCUTransportSerial extends MCUTransport {
    constructor(di = {}) {
        super(di);
        this._port = null;
        this._maxFrameSize = 127;
        // Account for the bytes needed for the frame header and newline
        const maxBase64Len = this._maxFrameSize - 3;
        // Take into account the 4 output bytes / 3 input bytes base64 ratio
        this._maxBodyBytesPerFrame = Math.floor(maxBase64Len / 4) * 3;
        // Keep track of whether we know the target's input line buffer state
        this._flushed = false;
        this._inputStream = null;
        this._inputStreamClosed = null;
        this._messageStream = null;
        this._messageStreamClosed = null;
        this._reader = null;
        this._writer = null;
        this._baudRate = di.baudRate || 115200;
    }

    async connect(filters) {
        try {
            this._port = await navigator.serial.requestPort(filters);
            this._logger.info(`Connecting to serial device...`);
            if (this._port) {
                this._port.addEventListener('disconnect', async event => {
                    this._logger.info(event);
                    if (!this._userRequestedDisconnect) {
                        this._logger.info('Serial device disconnected');
                        // Serial doesn't auto-reconnect like BLE
                        await this._disconnected();
                    } else {
                        await this._disconnected();
                    }
                });
            }
            await this._connectInternal();
        } catch (error) {
            this._logger.error(error);
            await this._disconnected(error);
            return;
        }
    }

    async _connectInternal() {
        try {
            this._connecting();
            const options = {
                baudRate: this._baudRate
            };
            await this._port.open(options);
            this._logger.info(`Port opened at ${this._baudRate} baud.`);

            this._inputStream = new TransformStream(new LineTransformer());
            this._inputStreamClosed = this._port.readable.pipeTo(this._inputStream.writable);
            this._inputStreamClosed.catch((error) => {
                // A lost serial device rejects the stream; treat as disconnect, not fatal crash.
                this._logger.info(error);
            });
            this._messageStream = new TransformStream(new ConsoleDeframerTransformer());
            this._messageStreamClosed = this._inputStream.readable.pipeTo(this._messageStream.writable);
            this._messageStreamClosed.catch((error) => {
                this._logger.info(error);
            });
            this._reader = this._messageStream.readable.getReader();
            this._readIncoming(this._reader);
            this._writer = this._port.writable.getWriter();

            await this._connected();
        } catch (error) {
            this._logger.error(error);
            await this._disconnected(error);
        }
    }

    async _disconnected(error = null) {
        await super._disconnected(error);
        this._port = null;
        this._inputStream = null;
        this._inputStreamClosed = null;
        this._messageStream = null;
        this._messageStreamClosed = null;
        this._reader = null;
        this._writer = null;
        this._flushed = false;
    }

    async disconnect() {
        await super.disconnect();
        if (this._reader) {
            await this._reader.cancel();
            await this._inputStreamClosed.catch(() => {});
            await this._messageStreamClosed.catch(() => {});
        }
        if (this._writer) {
            await this._writer.close();
        }
        if (this._port) {
            await this._port.close();
        }
        await this._disconnected();
    }

    get name() {
        return 'Serial';
    }

    async sendMessage(data) {
        const packetLength = data.byteLength + 2;
        const calculatedCrc16 = crc16ITUT(0x0000, data);

        // Concatenate the length, packet, and CRC16 together
        const body = new Uint8Array(packetLength + 2);
        const view = new DataView(body.buffer);
        view.setUint16(0, packetLength, false);
        body.set(data, 2);
        view.setUint16(packetLength, calculatedCrc16, false);

        // Split into frames no larger than the maximum frame size
        const numFramesNeeded = Math.ceil(body.length / this._maxBodyBytesPerFrame);
        const frames = [];

        for (let i = 0; i < numFramesNeeded; i++) {
            const offset = i * this._maxBodyBytesPerFrame;
            const bodyBytesRemaining = body.length - offset;
            const numBytesToEncode = Math.min(bodyBytesRemaining, this._maxBodyBytesPerFrame);
            const encodedString = btoa(String.fromCharCode.apply(null, body.subarray(offset, offset + numBytesToEncode)));
            const frame = new Uint8Array(3 + encodedString.length);

            if (i === 0) {
                // First frame is a packet start frame
                frame[0] = 0x06;
                frame[1] = 0x09;
            } else {
                // Subsequent frames are continuation frames
                frame[0] = 0x04;
                frame[1] = 0x14;
            }

            // Add the base64-encoded frame body
            for (let j = 0; j < encodedString.length; j++) {
                frame[2 + j] = encodedString.charCodeAt(j);
            }

            // Add the newline terminator
            frame[frame.length - 1] = 0x0A;
            frames.push(frame);
        }

        if (!this._flushed) {
            // Flush the target's line buffer if this is the first time
            // we're writing to it since opening the serial connection.
            await this._writer.write(new Uint8Array([0x0D, 0x0A]));
            this._flushed = true;
        }

        // Write each frame
        for (const frame of frames) {
            await this._writer.write(frame);
        }
    }

    async _readIncoming(reader) {
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (value) {
                    this._rawMessage(value);
                }
                if (done) {
                    break;
                }
            }
        } catch (error) {
            // Device unplug/reset during read should not surface as uncaught promise rejection.
            this._logger.info(error);
            await this._disconnected(error);
        }
    }
}

/**
 * MCU Manager - manages firmware updates and device communication.
 * Supports multiple transport types (Bluetooth LE, Serial).
 *
 * Based on original work by András Bártházi (boogie).
 * Serial transport based on work by devanlai (https://github.com/devanlai/mcumgr-web/tree/serial).
 */
class MCUManager {
    constructor(di = {}) {
        // Legacy properties for backward compatibility
        this.SERVICE_UUID = '8d53dc1d-1db7-4cd3-868b-8a527460aa84';
        this.CHARACTERISTIC_UUID = 'da2e7828-fbce-4e01-ae9e-261174997c48';

        this._mtu = di.mtu || 400;
        this._transport = null;
        this._connectCallback = null;
        this._connectingCallback = null;
        this._disconnectCallback = null;
        this._messageCallback = null;
        this._imageUploadProgressCallback = null;
        this._imageUploadErrorCallback = null;
        this._uploadIsInProgress = false;
        this._chunkTimeoutDefault = 5000;
        this._chunkTimeoutMax = 15000;
        this._chunkTimeout = this._chunkTimeoutDefault;
        this._uploadChunkSizeLimit = Number.POSITIVE_INFINITY;
        this._consecutiveTimeouts = 0;
        this._maxConsecutiveTimeouts = 2; // After this many timeouts, try increasing timeout
        this._maxTotalTimeouts = 6; // After this many total timeouts, give up
        this._totalTimeouts = 0;
        this._logger = di.logger || { info: console.log, error: console.error };
        this._seq = 0;
        this._reconnectDelay = di.reconnectDelay || 1000;
    }

    set smpVersion(version) {
        this._smpVersion = version;
    }

    get smpVersion() {
        if (this._smpVersion !== undefined) return this._smpVersion;
        return this._transport ? this._transport.smpVersion : SMP_VERSION_1;
    }

    /**
     * Connect to a device using the specified transport type.
     * @param {string} type - Transport type: 'bluetooth' or 'serial'. Defaults to 'bluetooth' for backward compatibility.
     * @param {Object} filters - Optional filters for device selection (transport-specific).
     */
    async connect(type = TRANSPORT_BLUETOOTH, filters) {
        // Handle backward compatibility: if type is an object (filters), assume bluetooth
        if (typeof type === 'object' && type !== null) {
            filters = type;
            type = TRANSPORT_BLUETOOTH;
        }

        switch (type) {
            case TRANSPORT_BLUETOOTH:
                this._transport = new MCUTransportBluetooth({
                    logger: this._logger,
                    reconnectDelay: this._reconnectDelay
                });
                this._chunkTimeoutDefault = 5000;
                this._chunkTimeoutMax = 15000;
                this._uploadChunkSizeLimit = Number.POSITIVE_INFINITY;
                break;
            case TRANSPORT_SERIAL:
                this._transport = new MCUTransportSerial({
                    logger: this._logger
                });
                // Serial uses smaller MTU due to console framing overhead
                this._mtu = 140;
                // Console-framed serial links can need more time per flash write.
                this._chunkTimeoutDefault = 10000;
                this._chunkTimeoutMax = 30000;
                this._uploadChunkSizeLimit = 64;
                break;
            default:
                throw new Error(`Unknown transport type: ${type}`);
        }

        if (this._transport) {
            this._transport.onConnect(async () => await this._connected());
            this._transport.onDisconnect((error) => this._disconnected(error));
            this._transport.onConnecting(() => this._connecting());
            this._transport.onRawMessage((message) => this._processMessage(message));
            await this._transport.connect(filters);
        }
    }

    disconnect() {
        if (this._transport) {
            return this._transport.disconnect();
        }
    }

    onConnecting(callback) {
        this._connectingCallback = callback;
        return this;
    }
    onConnect(callback) {
        this._connectCallback = callback;
        return this;
    }
    onDisconnect(callback) {
        this._disconnectCallback = callback;
        return this;
    }
    onMessage(callback) {
        this._messageCallback = callback;
        return this;
    }
    onImageUploadProgress(callback) {
        this._imageUploadProgressCallback = callback;
        return this;
    }
    onImageUploadFinished(callback) {
        this._imageUploadFinishedCallback = callback;
        return this;
    }
    onImageUploadError(callback) {
        this._imageUploadErrorCallback = callback;
        return this;
    }
    onImageUploadCancelled(callback) {
        this._imageUploadCancelledCallback = callback;
        return this;
    }

    _connecting() {
        if (this._connectingCallback) this._connectingCallback();
    }

    async _connected() {
        if (this._connectCallback) this._connectCallback();
        // Resume upload if one was in progress (e.g., after reconnection)
        if (this._uploadIsInProgress) {
            this._uploadNext();
        }
    }

    _disconnected(error = null) {
        this._logger.info('Disconnected.');
        if (this._disconnectCallback) this._disconnectCallback(error);
        this._transport = null;
        this._uploadIsInProgress = false;
    }

    get name() {
        return this._transport && this._transport.name;
    }

    async _sendMessage(op, group, id, data) {
        const smpVersion = this._smpVersion !== undefined ? this._smpVersion :
            (this._transport ? this._transport.smpVersion : SMP_VERSION_1);
        const byte0 = (op & 0x07) | ((smpVersion & 0x03) << 3);
        const _flags = 0;
        let encodedData = [];
        if (typeof data !== 'undefined') {
            encodedData = [...new Uint8Array(CBOR.encode(data))];
        }
        const length_lo = encodedData.length & 255;
        const length_hi = encodedData.length >> 8;
        const group_lo = group & 255;
        const group_hi = group >> 8;
        const message = [byte0, _flags, length_hi, length_lo, group_hi, group_lo, this._seq, id, ...encodedData];
        // console.log('>'  + message.map(x => x.toString(16).padStart(2, '0')).join(' '));
        await this._transport.sendMessage(Uint8Array.from(message));
        this._seq = (this._seq + 1) % 256;
    }

    _processMessage(message) {
        const op = message[0] & 0x07;
        const _flags = message[1];
        const length_hi = message[2];
        const length_lo = message[3];
        const group_hi = message[4];
        const group_lo = message[5];
        const _seq = message[6];
        const id = message[7];
        const data = CBOR.decode(message.slice(8).buffer);
        const length = length_hi * 256 + length_lo;
        const group = group_hi * 256 + group_lo;

        console.log('[MCUManager DEBUG] Message received:', {
            op,
            group,
            id,
            length,
            dataKeys: data ? Object.keys(data) : 'null',
            data: data
        });

        if (group === MGMT_GROUP_ID_IMAGE && id === IMG_MGMT_ID_UPLOAD) {
            // Clear timeout since we received a response
            if (this._uploadTimeout) {
                clearTimeout(this._uploadTimeout);
            }

            // Check for error response (SMP v1: data.rc, SMP v2: data.err.rc)
            const uploadErrRc = (data.err && typeof data.err.rc === 'number') ? data.err.rc : data.rc;
            if (uploadErrRc && uploadErrRc !== 0) {
                this._uploadIsInProgress = false;
                const errorMessages = {
                    1: 'Unknown error',
                    2: 'Slot is busy or in bad state. Try erasing the slot first or confirming/testing pending images.',
                    3: 'Invalid value',
                    4: 'Operation timeout',
                    5: 'No entry found',
                    6: 'Bad state',
                    7: 'Response too large',
                    8: 'Not supported',
                    9: 'Data is corrupt',
                    10: 'Device is busy'
                };
                const errorMsg = errorMessages[uploadErrRc] || `Device returned error code ${uploadErrRc}`;
                this._logger.error(`Upload failed: ${errorMsg}`);
                if (this._imageUploadErrorCallback) {
                    this._imageUploadErrorCallback({
                        error: `Upload failed: ${errorMsg}`,
                        errorCode: uploadErrRc,
                        consecutiveTimeouts: this._consecutiveTimeouts,
                        totalTimeouts: this._totalTimeouts
                    });
                }
                return;
            }

            // Success response with offset
            if ((data.rc === 0 || data.rc === undefined) && data.off !== undefined) {
                // Reset consecutive timeout counter on successful response
                this._consecutiveTimeouts = 0;
                this._uploadOffset = data.off;
                this._uploadNext();
                return;
            }
        }
        if (this._messageCallback) this._messageCallback({ op, group, id, data, length });
    }
    cmdReset() {
        return this._sendMessage(MGMT_OP_WRITE, MGMT_GROUP_ID_OS, OS_MGMT_ID_RESET);
    }
    smpEcho(message) {
        return this._sendMessage(MGMT_OP_WRITE, MGMT_GROUP_ID_OS, OS_MGMT_ID_ECHO, { d: message });
    }
    cmdImageState() {
        return this._sendMessage(MGMT_OP_READ, MGMT_GROUP_ID_IMAGE, IMG_MGMT_ID_STATE);
    }
    cmdImageErase() {
        return this._sendMessage(MGMT_OP_WRITE, MGMT_GROUP_ID_IMAGE, IMG_MGMT_ID_ERASE, {});
    }
    cmdImageTest(hash) {
        const hashStr = hash instanceof Uint8Array 
            ? Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('')
            : String(hash);
        console.log('[DEBUG] cmdImageTest: Sending test command', {
            hashType: hash instanceof Uint8Array ? 'Uint8Array' : typeof hash,
            hashLength: hash instanceof Uint8Array ? hash.byteLength : hash.length,
            hashHex: hashStr.substring(0, 16) + '...',
            confirm: false
        });
        return this._sendMessage(MGMT_OP_WRITE, MGMT_GROUP_ID_IMAGE, IMG_MGMT_ID_STATE, { hash, confirm: false });
    }
    cmdImageConfirm(hash) {
        const hashStr = hash instanceof Uint8Array 
            ? Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('')
            : String(hash);
        console.log('[DEBUG] cmdImageConfirm: Sending confirm command', {
            hashType: hash instanceof Uint8Array ? 'Uint8Array' : typeof hash,
            hashLength: hash instanceof Uint8Array ? hash.byteLength : hash.length,
            hashHex: hashStr.substring(0, 16) + '...',
            confirm: true
        });
        return this._sendMessage(MGMT_OP_WRITE, MGMT_GROUP_ID_IMAGE, IMG_MGMT_ID_STATE, { hash, confirm: true });
    }
    _hash(image) {
        return crypto.subtle.digest('SHA-256', image);
    }
    async _uploadNext() {
        if (this._uploadOffset >= this._uploadImage.byteLength) {
            this._uploadIsInProgress = false;
            this._imageUploadFinishedCallback();
            return;
        }

        // Clear any existing timeout
        if (this._uploadTimeout) {
            clearTimeout(this._uploadTimeout);
        }
        // Set new timeout
        this._uploadTimeout = setTimeout(() => {
            this._consecutiveTimeouts++;
            this._totalTimeouts++;

            this._logger.info(`Upload chunk timeout (consecutive: ${this._consecutiveTimeouts}, total: ${this._totalTimeouts})`);

            // If we've hit too many total timeouts, give up
            if (this._totalTimeouts >= this._maxTotalTimeouts) {
                this._uploadIsInProgress = false;
                const error = `Upload failed: Device not responding after ${this._totalTimeouts} attempts. The device may be too slow or disconnected.`;
                this._logger.error(error);
                if (this._imageUploadErrorCallback) {
                    this._imageUploadErrorCallback({ error, consecutiveTimeouts: this._consecutiveTimeouts, totalTimeouts: this._totalTimeouts });
                }
                return;
            }

            // If we've had several consecutive timeouts, increase the timeout duration
            if (this._consecutiveTimeouts >= this._maxConsecutiveTimeouts) {
                this._chunkTimeout = Math.min(this._chunkTimeout * 2, this._chunkTimeoutMax);
                if (this._uploadChunkSizeLimit > 32 && this._uploadChunkSizeLimit !== Number.POSITIVE_INFINITY) {
                    this._uploadChunkSizeLimit = Math.max(32, Math.floor(this._uploadChunkSizeLimit / 2));
                    this._logger.info(`Reduced upload chunk size to ${this._uploadChunkSizeLimit} bytes`);
                }
                this._logger.info(`Increased chunk timeout to ${this._chunkTimeout}ms`);
                // Notify UI about timeout adjustment
                if (this._imageUploadProgressCallback) {
                    this._imageUploadProgressCallback({
                        percentage: Math.floor(this._uploadOffset / this._uploadImage.byteLength * 100),
                        timeoutAdjusted: true,
                        newTimeout: this._chunkTimeout,
                        chunkSizeLimit: this._uploadChunkSizeLimit
                    });
                }
            }

            this._uploadNext();
        }, this._chunkTimeout);

        const nmpOverhead = 8;
        const message = { data: new Uint8Array(), off: this._uploadOffset };
        if (this._uploadOffset === 0) {
            message.len = this._uploadImage.byteLength;
            message.sha = new Uint8Array(await this._hash(this._uploadImage));
        }
        this._imageUploadProgressCallback({ percentage: Math.floor(this._uploadOffset / this._uploadImage.byteLength * 100) });

        const computedLength = this._mtu - CBOR.encode(message).byteLength - nmpOverhead;
        const length = Math.max(1, Math.min(computedLength, this._uploadChunkSizeLimit));

        message.data = new Uint8Array(this._uploadImage.slice(this._uploadOffset, this._uploadOffset + length));

        // Keep offset for retry
        // this._uploadOffset += length;

        this._sendMessage(MGMT_OP_WRITE, MGMT_GROUP_ID_IMAGE, IMG_MGMT_ID_UPLOAD, message);
    }
    async cmdUpload(image, slot = 0) {
        if (this._uploadIsInProgress) {
            this._logger.error('Upload is already in progress.');
            return;
        }
        this._uploadIsInProgress = true;

        this._uploadOffset = 0;
        this._uploadImage = image;
        this._uploadSlot = slot;

        // Reset timeout tracking
        this._consecutiveTimeouts = 0;
        this._totalTimeouts = 0;
        this._chunkTimeout = this._chunkTimeoutDefault;

        this._uploadNext();
    }
    cancelUpload() {
        if (!this._uploadIsInProgress) {
            return;
        }

        // Clear timeout
        if (this._uploadTimeout) {
            clearTimeout(this._uploadTimeout);
        }

        // Reset upload state
        this._uploadIsInProgress = false;
        this._uploadOffset = 0;
        this._uploadImage = null;
        this._consecutiveTimeouts = 0;
        this._totalTimeouts = 0;

        this._logger.info('Upload cancelled by user');

        // Notify callback
        if (this._imageUploadCancelledCallback) {
            this._imageUploadCancelledCallback();
        }
    }
    // Given an ArrayBuffer, extract Tag-Value pairs and return them one by one.
    *_extractTlvs(data) {
        const view = new DataView(data);
        let offset = 0;
        while (offset < view.byteLength) {
            const tag = view.getUint16(offset, true);
            const len = view.getUint16(offset + 2, true);
            offset += 4;
            const valueData = view.buffer.slice(offset, offset + len);
            offset += len;

            yield { tag, value: new Uint8Array(valueData) };
        }
    }
    async imageInfo(image) {
        // https://interrupt.memfault.com/blog/mcuboot-overview#mcuboot-image-binaries

        const info = {};
        info.tags = {};
        const view = new DataView(image);

        // check header length
        if (view.length < 32) {
            throw new Error('Invalid image (too short file)');
        }

        // check MAGIC bytes 0x96f3b83d
        if (view.getUint32(0, true) !== 0x96f3b83d) {
            throw new Error('Invalid image (wrong magic bytes)');
        }

        // check load address is 0x00000000
        if (view.getUint32(4, true) !== 0) {
            throw new Error('Invalid image (wrong load address)');
        }

        const headerSize = view.getUint16(8, true);

        // Protected TLV area is included in the hash
        const protected_tlv_length = view.getUint16(10, true);

        const imageSize = view.getUint32(12, true);
        info.imageSize = imageSize;

        // check image size is correct
        if (view.length < imageSize + headerSize) {
            throw new Error('Invalid image (wrong image size)');
        }

        // check flags is 0x00000000
        if (view.getUint32(16, true) !== 0x00) {
            throw new Error('Invalid image (wrong flags)');
        }

        const version = `${view.getUint8(20)}.${view.getUint8(21)}.${view.getUint16(22, true)}`;
        info.version = version;

        const hashBytes = new Uint8Array(await this._hash(image.slice(0, imageSize + headerSize + protected_tlv_length)));
        info.hash = [...hashBytes].map(b => b.toString(16).padStart(2, '0')).join('');

        let offset = headerSize + imageSize;
        let tlv_end = offset;

        // Only if it was indicated that there were protected TLVs
        if (protected_tlv_length > 0) {
            // Verify the protected TLV magic bytes are valid.
            if (view.getUint16(offset, true) !== 0x6908) {
                throw new Error( `Expected protected TLV magic number. (0x${offset.toString(16)}: 0x${view.getUint16(offset, true).toString(16)})`);
            }

            // Find the end of the protected TLV region
            tlv_end = view.getUint16(offset + 2, true) + offset;
            // Store all tag-value pairs for the protected TLV region.
            for (let tlv of this._extractTlvs(view.buffer.slice(offset + 4, tlv_end))) {
                info.tags[tlv.tag] = tlv.value;
            }
            offset = tlv_end;
        }

        // The non-protected TLV region must be here.
        if (view.getUint16(offset, true) !== 0x6907) {
            throw new Error(`Expected TLV magic number. (0x${offset.toString(16)}: 0x${view.getUint16(offset, true).toString(16)})`);
        }

        // Also include the non-protected TLVs in the tags map.
        // Assume there are no overlapping tag Ids.
        tlv_end = view.getUint16(offset + 2, true) + offset;
        for (let tlv of this._extractTlvs(view.buffer.slice(offset + 4, tlv_end))) {
            info.tags[tlv.tag] = tlv.value;
        }

        // If the image hash tag is present, verify it matches what was calculated earlier.
        if (16 in info.tags && info.tags[16].length == hashBytes.length) {
            info.hashValid = info.tags[16].every((b, i) => b === hashBytes[i]);
        }

        return info;
    }
}

// Export for Node.js (testing) while keeping browser compatibility
// Make constants available globally for browser script usage
if (typeof window !== 'undefined') {
    window.MCUManager = MCUManager;
    window.MCUTransport = MCUTransport;
    window.MCUTransportBluetooth = MCUTransportBluetooth;
    window.MCUTransportSerial = MCUTransportSerial;
    window.LineTransformer = LineTransformer;
    window.ConsoleDeframerTransformer = ConsoleDeframerTransformer;
    window.crc16ITUT = crc16ITUT;
    window.TRANSPORT_BLUETOOTH = TRANSPORT_BLUETOOTH;
    window.TRANSPORT_SERIAL = TRANSPORT_SERIAL;
    window.SMP_VERSION_1 = SMP_VERSION_1;
    window.SMP_VERSION_2 = SMP_VERSION_2;
    window.MGMT_OP_READ = MGMT_OP_READ;
    window.MGMT_OP_READ_RSP = MGMT_OP_READ_RSP;
    window.MGMT_OP_WRITE = MGMT_OP_WRITE;
    window.MGMT_OP_WRITE_RSP = MGMT_OP_WRITE_RSP;
    window.MGMT_GROUP_ID_OS = MGMT_GROUP_ID_OS;
    window.MGMT_GROUP_ID_IMAGE = MGMT_GROUP_ID_IMAGE;
    window.MGMT_GROUP_ID_STAT = MGMT_GROUP_ID_STAT;
    window.MGMT_GROUP_ID_CONFIG = MGMT_GROUP_ID_CONFIG;
    window.MGMT_GROUP_ID_LOG = MGMT_GROUP_ID_LOG;
    window.MGMT_GROUP_ID_CRASH = MGMT_GROUP_ID_CRASH;
    window.MGMT_GROUP_ID_SPLIT = MGMT_GROUP_ID_SPLIT;
    window.MGMT_GROUP_ID_RUN = MGMT_GROUP_ID_RUN;
    window.MGMT_GROUP_ID_FS = MGMT_GROUP_ID_FS;
    window.MGMT_GROUP_ID_SHELL = MGMT_GROUP_ID_SHELL;
    window.OS_MGMT_ID_ECHO = OS_MGMT_ID_ECHO;
    window.OS_MGMT_ID_CONS_ECHO_CTRL = OS_MGMT_ID_CONS_ECHO_CTRL;
    window.OS_MGMT_ID_TASKSTAT = OS_MGMT_ID_TASKSTAT;
    window.OS_MGMT_ID_MPSTAT = OS_MGMT_ID_MPSTAT;
    window.OS_MGMT_ID_DATETIME_STR = OS_MGMT_ID_DATETIME_STR;
    window.OS_MGMT_ID_RESET = OS_MGMT_ID_RESET;
    window.IMG_MGMT_ID_STATE = IMG_MGMT_ID_STATE;
    window.IMG_MGMT_ID_UPLOAD = IMG_MGMT_ID_UPLOAD;
    window.IMG_MGMT_ID_FILE = IMG_MGMT_ID_FILE;
    window.IMG_MGMT_ID_CORELIST = IMG_MGMT_ID_CORELIST;
    window.IMG_MGMT_ID_CORELOAD = IMG_MGMT_ID_CORELOAD;
    window.IMG_MGMT_ID_ERASE = IMG_MGMT_ID_ERASE;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MCUManager,
        MCUTransport,
        MCUTransportBluetooth,
        MCUTransportSerial,
        LineTransformer,
        ConsoleDeframerTransformer,
        crc16ITUT,
        TRANSPORT_BLUETOOTH,
        TRANSPORT_SERIAL,
        SMP_VERSION_1,
        SMP_VERSION_2,
        MGMT_OP_READ,
        MGMT_OP_READ_RSP,
        MGMT_OP_WRITE,
        MGMT_OP_WRITE_RSP,
        MGMT_GROUP_ID_OS,
        MGMT_GROUP_ID_IMAGE,
        MGMT_GROUP_ID_STAT,
        MGMT_GROUP_ID_CONFIG,
        MGMT_GROUP_ID_LOG,
        MGMT_GROUP_ID_CRASH,
        MGMT_GROUP_ID_SPLIT,
        MGMT_GROUP_ID_RUN,
        MGMT_GROUP_ID_FS,
        MGMT_GROUP_ID_SHELL,
        OS_MGMT_ID_ECHO,
        OS_MGMT_ID_CONS_ECHO_CTRL,
        OS_MGMT_ID_TASKSTAT,
        OS_MGMT_ID_MPSTAT,
        OS_MGMT_ID_DATETIME_STR,
        OS_MGMT_ID_RESET,
        IMG_MGMT_ID_STATE,
        IMG_MGMT_ID_UPLOAD,
        IMG_MGMT_ID_FILE,
        IMG_MGMT_ID_CORELIST,
        IMG_MGMT_ID_CORELOAD,
        IMG_MGMT_ID_ERASE
    };
}
