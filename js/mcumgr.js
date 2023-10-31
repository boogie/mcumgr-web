
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

class MCUManager {
    constructor(di = {}) {
        this.SERVICE_UUID = '8d53dc1d-1db7-4cd3-868b-8a527460aa84';
        this.CHARACTERISTIC_UUID = 'da2e7828-fbce-4e01-ae9e-261174997c48';
        this._mtu = 140;
        this._device = null;
        this._service = null;
        this._characteristic = null;
        this._connectCallback = null;
        this._connectingCallback = null;
        this._disconnectCallback = null;
        this._messageCallback = null;
        this._imageUploadProgressCallback = null;
        this._uploadIsInProgress = false;
        this._buffer = new Uint8Array();
        this._logger = di.logger || { info: console.log, error: console.error };
        this._seq = 0;
        this._userRequestedDisconnect = false;
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
                    this._connect(1000);
                } else {
                    this._disconnected();
                }
            });
            this._connect(0);
        } catch (error) {
            this._logger.error(error);
            await this._disconnected();
            return;
        }
    }
    _connect() {
        setTimeout(async () => {
            try {
                if (this._connectingCallback) this._connectingCallback();
                const server = await this._device.gatt.connect();
                this._logger.info(`Server connected.`);
                this._service = await server.getPrimaryService(this.SERVICE_UUID);
                this._logger.info(`Service connected.`);
                this._characteristic = await this._service.getCharacteristic(this.CHARACTERISTIC_UUID);
                this._characteristic.addEventListener('characteristicvaluechanged', this._notification.bind(this));
                await this._characteristic.startNotifications();
                await this._connected();
                if (this._uploadIsInProgress) {
                    this._uploadNext();
                }
            } catch (error) {
                this._logger.error(error);
                await this._disconnected();
            }
        }, 1000);
    }
    disconnect() {
        this._userRequestedDisconnect = true;
        return this._device.gatt.disconnect();
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
    async _connected() {
        if (this._connectCallback) this._connectCallback();
    }
    async _disconnected() {
        this._logger.info('Disconnected.');
        if (this._disconnectCallback) this._disconnectCallback();
        this._device = null;
        this._service = null;
        this._characteristic = null;
        this._uploadIsInProgress = false;
        this._userRequestedDisconnect = false;
    }
    get name() {
        return this._device && this._device.name;
    }
    async _sendMessage(op, group, id, data) {
        const _flags = 0;
        let encodedData = [];
        if (typeof data !== 'undefined') {
            encodedData = [...new Uint8Array(CBOR.encode(data))];
        }
        const length_lo = encodedData.length & 255;
        const length_hi = encodedData.length >> 8;
        const group_lo = group & 255;
        const group_hi = group >> 8;
        const message = [op, _flags, length_hi, length_lo, group_hi, group_lo, this._seq, id, ...encodedData];
        // console.log('>'  + message.map(x => x.toString(16).padStart(2, '0')).join(' '));
        await this._characteristic.writeValueWithoutResponse(Uint8Array.from(message));
        this._seq = (this._seq + 1) % 256;
    }
    _notification(event) {
        // console.log('message received');
        const message = new Uint8Array(event.target.value.buffer);
        // console.log(message);
        // console.log('<'  + [...message].map(x => x.toString(16).padStart(2, '0')).join(' '));
        this._buffer = new Uint8Array([...this._buffer, ...message]);
        const messageLength = this._buffer[2] * 256 + this._buffer[3];
        if (this._buffer.length < messageLength + 8) return;
        this._processMessage(this._buffer.slice(0, messageLength + 8));
        this._buffer = this._buffer.slice(messageLength + 8);
    }
    _processMessage(message) {
        const [op, _flags, length_hi, length_lo, group_hi, group_lo, _seq, id] = message;
        const data = CBOR.decode(message.slice(8).buffer);
        const length = length_hi * 256 + length_lo;
        const group = group_hi * 256 + group_lo;
        if (group === MGMT_GROUP_ID_IMAGE && id === IMG_MGMT_ID_UPLOAD && (data.rc === 0 || data.rc === undefined) && data.off){
            this._uploadOffset = data.off;            
            this._uploadNext();
            return;
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
        return this._sendMessage(MGMT_OP_WRITE, MGMT_GROUP_ID_IMAGE, IMG_MGMT_ID_STATE, { hash, confirm: false });
    }
    cmdImageConfirm(hash) {
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

        const nmpOverhead = 8;
        const message = { data: new Uint8Array(), off: this._uploadOffset };
        if (this._uploadOffset === 0) {
            message.len = this._uploadImage.byteLength;
            message.sha = new Uint8Array(await this._hash(this._uploadImage));
        }
        this._imageUploadProgressCallback({ percentage: Math.floor(this._uploadOffset / this._uploadImage.byteLength * 100) });

        const length = this._mtu - CBOR.encode(message).byteLength - nmpOverhead;

        message.data = new Uint8Array(this._uploadImage.slice(this._uploadOffset, this._uploadOffset + length));

        this._uploadOffset += length;

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

        this._uploadNext();
    }
    async imageInfo(image) {
        // https://interrupt.memfault.com/blog/mcuboot-overview#mcuboot-image-binaries

        const info = {};
        const view = new Uint8Array(image);

        // check header length
        if (view.length < 32) {
            throw new Error('Invalid image (too short file)');
        }

        // check MAGIC bytes 0x96f3b83d
        if (view[0] !== 0x3d || view[1] !== 0xb8 || view[2] !== 0xf3 || view[3] !== 0x96) {
            throw new Error('Invalid image (wrong magic bytes)');
        }

        // check load address is 0x00000000
        if (view[4] !== 0x00 || view[5] !== 0x00 || view[6] !== 0x00 || view[7] !== 0x00) {
            throw new Error('Invalid image (wrong load address)');
        }

        const headerSize = view[8] + view[9] * 2**8;

        // check protected TLV area size is 0
        if (view[10] !== 0x00 || view[11] !== 0x00) {
            throw new Error('Invalid image (wrong protected TLV area size)');
        }

        const imageSize = view[12] + view[13] * 2**8 + view[14] * 2**16 + view[15] * 2**24;
        info.imageSize = imageSize;

        // check image size is correct
        if (view.length < imageSize + headerSize) {
            throw new Error('Invalid image (wrong image size)');
        }

        // check flags is 0x00000000
        if (view[16] !== 0x00 || view[17] !== 0x00 || view[18] !== 0x00 || view[19] !== 0x00) {
            throw new Error('Invalid image (wrong flags)');
        }

        const version = `${view[20]}.${view[21]}.${view[22] + view[23] * 2**8}`;
        info.version = version;

        info.hash = [...new Uint8Array(await this._hash(image.slice(0, imageSize + 32)))].map(b => b.toString(16).padStart(2, '0')).join('');

        return info;
    }
}

