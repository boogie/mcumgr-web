const SMP_OP_READ       = 0;
const SMP_OP_READ_RSP   = 1;
const SMP_OP_WRITE      = 2;
const SMP_OP_WRITE_RSP  = 3;

const SMP_GROUP_DEFAULT = 0;
const SMP_GROUP_IMAGES  = 1;

// default group
const SMP_ID_DEFAULT_ECHO     = 0;
const SMP_ID_DEFAULT_TASKSTAT = 2;
const SMP_ID_DEFAULT_MPSTAT   = 3;
const SMP_ID_DEFAULT_RESET    = 5;

// images group
const SMP_ID_IMAGES_LIST = 0;

class NewtManager {
    constructor(di = {}) {
        this.SERVICE_SMP_UUID = '8d53dc1d-1db7-4cd3-868b-8a527460aa84';
        this.CHARACTERISTIC_SMP_UUID = 'da2e7828-fbce-4e01-ae9e-261174997c48';
        this.deviceName = null;
        this._device = null;
        this._service = null;
        this._characteristic = null;
        this._connectCallback = null;
        this._connectingCallback = null;
        this._disconnectCallback = null;
        this._messageCallback = null;
        this._queue = [];
        this._communicationIsInProgress = false;
        this._mtu = 140;
        this._smpBuffer = new Uint8Array();
        this._logger = di.logger || { info: message => { console.log(message); }, error: message => { console.error(message); } };
        this._smpSeq = 0;
    }
    async _requestDevice() {
        return navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [this.SERVICE_SMP_UUID]
        });
    }
    async connect() {
        try {
            this._device = await this._requestDevice();
            this.deviceName = this._device.name;
            this._logger.info(`Connecting to device ${this.deviceName}...`);
            this._device.addEventListener('gattserverdisconnected', (event) => {
                this._logger.info(event);
                this._disconnected();
            });
            if (this._connectingCallback) this._connectingCallback();
            const server = await this._device.gatt.connect();
            this._logger.info(`Server connected.`);
            const smpService = await server.getPrimaryService(this.SERVICE_SMP_UUID);
            this._logger.info(`SMP service connected.`);
            this._smpCharacteristic = await smpService.getCharacteristic(this.CHARACTERISTIC_SMP_UUID);
            this._smpCharacteristic.addEventListener('characteristicvaluechanged', this._smpNotification.bind(this));
            await this._smpCharacteristic.startNotifications();
        } catch (error) {
            this._logger.info(`Error: ${error.message}`);
            this._disconnected();
            return;
        }
        await this._connected();
    }
    disconnect() {
        this._device.gatt.disconnect();
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
    _decodeSmpMessage(message) {
        const [op, _flags, length_hi, length_lo, group_hi, group_lo, _seq, id] = message;
        const data = CBOR.decode(message.slice(8).buffer);
        const length = length_hi * 256 + length_lo;
        const group = group_hi * 256 + group_lo;
        switch (op) {
            case SMP_OP_READ:
                this._logger.info('SMP_OP_READ');
                break;
            case SMP_OP_READ_RSP:
                this._logger.info('SMP_OP_READ_RSP');
                break;
            case SMP_OP_WRITE:
                this._logger.info('SMP_OP_WRITE');
                break;
            case SMP_OP_WRITE_RSP:
                this._logger.info('SMP_OP_WRITE_RSP');
                break;
            default:
                this._logger.info('unknown SMP operation');
                break;
        }
        switch (group) {
            case SMP_GROUP_DEFAULT:
                switch (id) {
                    case SMP_ID_DEFAULT_ECHO:
                        this._logger.info('SMP_ID_DEFAULT_ECHO');
                        alert(data.r);
                        break;
                    case SMP_ID_DEFAULT_TASKSTAT:
                        this._logger.info('SMP_ID_DEFAULT_TASKSTATS');
                        break;
                }
                break;
            case SMP_GROUP_IMAGES:
                switch (id) {
                    case SMP_ID_IMAGES_LIST:
                        this._logger.info('SMP_ID_IMAGES_LIST');
                        let images = '';
                        data.images.forEach(image => {
                            images += '<div class="image">';
                            const active = image.active ? '<small class="text-muted">active</small>' : '';
                            images += `<h2>Slot #${image.slot} ${active}</h2>`;
                            images += '<table>';
                            const hashStr = Array.from(image.hash).map(byte => byte.toString(16).padStart(2, '0')).join('');
                            images += `<tr><th>Version</th><td>v${image.version}</td></tr>`;
                            images += `<tr><th>Bootable</th><td>${image.bootable}</td></tr>`;
                            images += `<tr><th>Confirmed</th><td>${image.confirmed}</td></tr>`;
                            images += `<tr><th>Pending</th><td>${image.pending}</td></tr>`;
                            images += `<tr><th>Hash</th><td>${hashStr}</td></tr>`;
                            images += '</table>';
                            images += '</div>';
                        });
                        imageList.innerHTML = images;
                        break;
                }
                break;
            default:
                this._logger.info('unknown SMP group');
                break;
        }        
    }
    _smpNotification(event) {
        const message = new Uint8Array(event.target.value.buffer);
        this._smpBuffer = new Uint8Array([...this._smpBuffer, ...message]);
        const messageLength = this._smpBuffer[2] * 256 + this._smpBuffer[3];
        if (this._smpBuffer.length < messageLength + 8) return;
        this._decodeSmpMessage(this._smpBuffer.slice(0, messageLength + 8));
        this._smpBuffer = this._smpBuffer.slice(messageLength + 8);
    }
    async _connected() {
        if (this._connectCallback) this._connectCallback();
        this.smpImageList();
    }
    async _disconnected() {
        this._logger.info('Disconnected.');
        if (this._disconnectCallback) this._disconnectCallback();
        this._device = null;
        this.deviceName = null;

    }
    async _sendSmpMessage(op, group, id, data) {
        const _flags = 0;
        let encodedData = [];
        if (data) {
            encodedData = [...new Uint8Array(CBOR.encode(data))];
        }
        const length_lo = encodedData.length & 255;
        const length_hi = encodedData.length >> 8;
        const group_lo = group & 255;
        const group_hi = group >> 8;
        const message = [op, _flags, length_hi, length_lo, group_hi, group_lo, this._smpSeq, id, ...encodedData];
        await this._smpCharacteristic.writeValueWithoutResponse(Uint8Array.from(message));
        this._smpSeq = (this._smpSeq + 1) % 256;
    }
    smpImageList() {
        return this._sendSmpMessage(SMP_OP_READ, SMP_GROUP_IMAGES, SMP_ID_IMAGES_LIST);
    }
    smpTaskStats() {
        return this._sendSmpMessage(SMP_OP_READ, SMP_GROUP_DEFAULT, SMP_ID_DEFAULT_TASKSTAT);
    }
    smpMpStats() {
        return this._sendSmpMessage(SMP_OP_READ, SMP_GROUP_DEFAULT, SMP_ID_DEFAULT_MPSTAT);
    }
    smpReset() {
        return this._sendSmpMessage(SMP_OP_WRITE, SMP_GROUP_DEFAULT, SMP_ID_DEFAULT_RESET);
    }
    smpEcho(message) {
        return this._sendSmpMessage(SMP_OP_WRITE, SMP_GROUP_DEFAULT, SMP_ID_DEFAULT_ECHO, { d: message });
    }
}

