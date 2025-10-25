const {
  MCUManager,
  MGMT_OP_READ,
  MGMT_OP_WRITE,
  MGMT_GROUP_ID_OS,
  MGMT_GROUP_ID_IMAGE,
  OS_MGMT_ID_ECHO,
  OS_MGMT_ID_RESET,
  IMG_MGMT_ID_STATE,
  IMG_MGMT_ID_UPLOAD,
  IMG_MGMT_ID_ERASE
} = require('../js/mcumgr.js');

describe('MCUManager', () => {
  let manager;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn()
    };
    manager = new MCUManager({ logger: mockLogger });

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with default values', () => {
      expect(manager.SERVICE_UUID).toBe('8d53dc1d-1db7-4cd3-868b-8a527460aa84');
      expect(manager.CHARACTERISTIC_UUID).toBe('da2e7828-fbce-4e01-ae9e-261174997c48');
      expect(manager._mtu).toBe(400);
      expect(manager._device).toBeNull();
      expect(manager._seq).toBe(0);
      expect(manager._uploadIsInProgress).toBe(false);
      expect(manager._userRequestedDisconnect).toBe(false);
    });

    test('should accept custom logger via dependency injection', () => {
      const customLogger = { info: jest.fn(), error: jest.fn() };
      const mgr = new MCUManager({ logger: customLogger });
      expect(mgr._logger).toBe(customLogger);
    });

    test('should use console as default logger', () => {
      const mgr = new MCUManager();
      expect(mgr._logger).toBeDefined();
    });

    test('should accept custom reconnect delay', () => {
      const mgr = new MCUManager({ reconnectDelay: 2000 });
      expect(mgr._reconnectDelay).toBe(2000);
    });

    test('should use default reconnect delay of 1000ms', () => {
      expect(manager._reconnectDelay).toBe(1000);
    });
  });

  describe('Callback Registration', () => {
    test('onConnect should register connect callback', () => {
      const callback = jest.fn();
      const result = manager.onConnect(callback);
      expect(manager._connectCallback).toBe(callback);
      expect(result).toBe(manager); // Should return this for chaining
    });

    test('onDisconnect should register disconnect callback', () => {
      const callback = jest.fn();
      const result = manager.onDisconnect(callback);
      expect(manager._disconnectCallback).toBe(callback);
      expect(result).toBe(manager);
    });

    test('onMessage should register message callback', () => {
      const callback = jest.fn();
      const result = manager.onMessage(callback);
      expect(manager._messageCallback).toBe(callback);
      expect(result).toBe(manager);
    });

    test('onImageUploadProgress should register upload progress callback', () => {
      const callback = jest.fn();
      const result = manager.onImageUploadProgress(callback);
      expect(manager._imageUploadProgressCallback).toBe(callback);
      expect(result).toBe(manager);
    });

    test('onImageUploadFinished should register upload finished callback', () => {
      const callback = jest.fn();
      const result = manager.onImageUploadFinished(callback);
      expect(manager._imageUploadFinishedCallback).toBe(callback);
      expect(result).toBe(manager);
    });

    test('onConnecting should register connecting callback', () => {
      const callback = jest.fn();
      const result = manager.onConnecting(callback);
      expect(manager._connectingCallback).toBe(callback);
      expect(result).toBe(manager);
    });
  });

  describe('Device Name', () => {
    test('should return null when no device is connected', () => {
      expect(manager.name).toBeNull();
    });

    test('should return device name when device is connected', () => {
      manager._device = { name: 'TestDevice' };
      expect(manager.name).toBe('TestDevice');
    });
  });

  describe('Image Validation', () => {
    test('should reject image that is too short', async () => {
      const shortImage = new Uint8Array(20).buffer;
      await expect(manager.imageInfo(shortImage)).rejects.toThrow('Invalid image (too short file)');
    });

    test('should reject image with wrong magic bytes', async () => {
      const invalidImage = new Uint8Array(32);
      invalidImage[0] = 0x00; // Wrong magic bytes
      invalidImage[1] = 0x00;
      invalidImage[2] = 0x00;
      invalidImage[3] = 0x00;
      await expect(manager.imageInfo(invalidImage.buffer)).rejects.toThrow('Invalid image (wrong magic bytes)');
    });

    test('should reject image with wrong load address', async () => {
      const invalidImage = new Uint8Array(32);
      // Correct magic bytes
      invalidImage[0] = 0x3d;
      invalidImage[1] = 0xb8;
      invalidImage[2] = 0xf3;
      invalidImage[3] = 0x96;
      // Wrong load address (should be 0x00000000)
      invalidImage[4] = 0x01;
      invalidImage[5] = 0x00;
      invalidImage[6] = 0x00;
      invalidImage[7] = 0x00;
      await expect(manager.imageInfo(invalidImage.buffer)).rejects.toThrow('Invalid image (wrong load address)');
    });

    test('should reject image with wrong protected TLV area size', async () => {
      const invalidImage = new Uint8Array(32);
      // Correct magic bytes
      invalidImage[0] = 0x3d;
      invalidImage[1] = 0xb8;
      invalidImage[2] = 0xf3;
      invalidImage[3] = 0x96;
      // Correct load address
      invalidImage[4] = 0x00;
      invalidImage[5] = 0x00;
      invalidImage[6] = 0x00;
      invalidImage[7] = 0x00;
      // Header size
      invalidImage[8] = 0x20; // 32 bytes
      invalidImage[9] = 0x00;
      // Wrong protected TLV area size (should be 0)
      invalidImage[10] = 0x01;
      invalidImage[11] = 0x00;
      await expect(manager.imageInfo(invalidImage.buffer)).rejects.toThrow('Invalid image (wrong protected TLV area size)');
    });

    test('should reject image with incorrect image size', async () => {
      const invalidImage = new Uint8Array(100);
      // Correct magic bytes
      invalidImage[0] = 0x3d;
      invalidImage[1] = 0xb8;
      invalidImage[2] = 0xf3;
      invalidImage[3] = 0x96;
      // Correct load address
      invalidImage[4] = 0x00;
      invalidImage[5] = 0x00;
      invalidImage[6] = 0x00;
      invalidImage[7] = 0x00;
      // Header size
      invalidImage[8] = 0x20; // 32 bytes
      invalidImage[9] = 0x00;
      // Protected TLV area size
      invalidImage[10] = 0x00;
      invalidImage[11] = 0x00;
      // Image size (larger than actual buffer)
      invalidImage[12] = 0x00;
      invalidImage[13] = 0x10; // 4096 bytes (too large)
      invalidImage[14] = 0x00;
      invalidImage[15] = 0x00;
      await expect(manager.imageInfo(invalidImage.buffer)).rejects.toThrow('Invalid image (wrong image size)');
    });

    test('should reject image with wrong flags', async () => {
      const invalidImage = new Uint8Array(100);
      // Correct magic bytes
      invalidImage[0] = 0x3d;
      invalidImage[1] = 0xb8;
      invalidImage[2] = 0xf3;
      invalidImage[3] = 0x96;
      // Correct load address
      invalidImage[4] = 0x00;
      invalidImage[5] = 0x00;
      invalidImage[6] = 0x00;
      invalidImage[7] = 0x00;
      // Header size
      invalidImage[8] = 0x20; // 32 bytes
      invalidImage[9] = 0x00;
      // Protected TLV area size
      invalidImage[10] = 0x00;
      invalidImage[11] = 0x00;
      // Image size
      invalidImage[12] = 0x40; // 64 bytes
      invalidImage[13] = 0x00;
      invalidImage[14] = 0x00;
      invalidImage[15] = 0x00;
      // Wrong flags (should be 0x00000000)
      invalidImage[16] = 0x01;
      invalidImage[17] = 0x00;
      invalidImage[18] = 0x00;
      invalidImage[19] = 0x00;
      await expect(manager.imageInfo(invalidImage.buffer)).rejects.toThrow('Invalid image (wrong flags)');
    });

    test('should parse valid image info correctly', async () => {
      const validImage = new Uint8Array(96); // 32 header + 64 image
      // Correct magic bytes
      validImage[0] = 0x3d;
      validImage[1] = 0xb8;
      validImage[2] = 0xf3;
      validImage[3] = 0x96;
      // Correct load address
      validImage[4] = 0x00;
      validImage[5] = 0x00;
      validImage[6] = 0x00;
      validImage[7] = 0x00;
      // Header size
      validImage[8] = 0x20; // 32 bytes
      validImage[9] = 0x00;
      // Protected TLV area size
      validImage[10] = 0x00;
      validImage[11] = 0x00;
      // Image size
      validImage[12] = 0x40; // 64 bytes
      validImage[13] = 0x00;
      validImage[14] = 0x00;
      validImage[15] = 0x00;
      // Flags
      validImage[16] = 0x00;
      validImage[17] = 0x00;
      validImage[18] = 0x00;
      validImage[19] = 0x00;
      // Version: 1.2.300
      validImage[20] = 0x01; // Major
      validImage[21] = 0x02; // Minor
      validImage[22] = 0x2c; // Revision low byte (300 = 0x012c)
      validImage[23] = 0x01; // Revision high byte

      const info = await manager.imageInfo(validImage.buffer);
      expect(info.version).toBe('1.2.300');
      expect(info.imageSize).toBe(64);
      expect(info.hash).toBeDefined();
      expect(typeof info.hash).toBe('string');
    });
  });

  describe('Message Processing', () => {
    test('should process message buffer correctly', () => {
      const mockCallback = jest.fn();
      manager.onMessage(mockCallback);

      // Mock CBOR decode to return test data
      global.CBOR.decode.mockReturnValue({ rc: 0, test: 'data' });

      // Create a test message: [op, flags, length_hi, length_lo, group_hi, group_lo, seq, id, ...data]
      const message = new Uint8Array([
        MGMT_OP_READ, // op
        0x00, // flags
        0x00, 0x00, // length (will be set by CBOR)
        0x00, MGMT_GROUP_ID_IMAGE, // group
        0x05, // seq
        IMG_MGMT_ID_STATE, // id
      ]);

      manager._processMessage(message);

      expect(mockCallback).toHaveBeenCalledWith({
        op: MGMT_OP_READ,
        group: MGMT_GROUP_ID_IMAGE,
        id: IMG_MGMT_ID_STATE,
        data: { rc: 0, test: 'data' },
        length: 0
      });
    });

    test('should handle upload response and trigger next upload', () => {
      const mockCallback = jest.fn();
      manager.onMessage(mockCallback);
      manager._uploadIsInProgress = true;
      manager._uploadNext = jest.fn();

      // Mock CBOR decode to return upload response
      global.CBOR.decode.mockReturnValue({ rc: 0, off: 512 });

      const message = new Uint8Array([
        MGMT_OP_WRITE, // op
        0x00, // flags
        0x00, 0x00, // length
        0x00, MGMT_GROUP_ID_IMAGE, // group
        0x05, // seq
        IMG_MGMT_ID_UPLOAD, // id
      ]);

      manager._processMessage(message);

      expect(manager._uploadOffset).toBe(512);
      expect(manager._uploadNext).toHaveBeenCalled();
      expect(mockCallback).not.toHaveBeenCalled(); // Upload responses don't trigger message callback
    });

    test('should buffer incomplete messages', () => {
      const mockCallback = jest.fn();
      manager.onMessage(mockCallback);

      // Create notification event with partial message
      const partialMessage = new Uint8Array([
        MGMT_OP_READ, 0x00, 0x00, 0x10 // Indicates 16 bytes of data, but we'll send less
      ]);

      const event = {
        target: {
          value: {
            buffer: partialMessage.buffer
          }
        }
      };

      manager._notification(event);

      // Should buffer but not process
      expect(manager._buffer.length).toBe(4);
      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  describe('Command Methods', () => {
    beforeEach(() => {
      // Mock _sendMessage for command tests
      manager._sendMessage = jest.fn();
    });

    test('cmdReset should send reset command', () => {
      manager.cmdReset();
      expect(manager._sendMessage).toHaveBeenCalledWith(
        MGMT_OP_WRITE,
        MGMT_GROUP_ID_OS,
        OS_MGMT_ID_RESET
      );
    });

    test('smpEcho should send echo command with message', () => {
      manager.smpEcho('test message');
      expect(manager._sendMessage).toHaveBeenCalledWith(
        MGMT_OP_WRITE,
        MGMT_GROUP_ID_OS,
        OS_MGMT_ID_ECHO,
        { d: 'test message' }
      );
    });

    test('cmdImageState should send image state read command', () => {
      manager.cmdImageState();
      expect(manager._sendMessage).toHaveBeenCalledWith(
        MGMT_OP_READ,
        MGMT_GROUP_ID_IMAGE,
        IMG_MGMT_ID_STATE
      );
    });

    test('cmdImageErase should send image erase command', () => {
      manager.cmdImageErase();
      expect(manager._sendMessage).toHaveBeenCalledWith(
        MGMT_OP_WRITE,
        MGMT_GROUP_ID_IMAGE,
        IMG_MGMT_ID_ERASE,
        {}
      );
    });

    test('cmdImageTest should send image test command with hash', () => {
      const testHash = 'abc123';
      manager.cmdImageTest(testHash);
      expect(manager._sendMessage).toHaveBeenCalledWith(
        MGMT_OP_WRITE,
        MGMT_GROUP_ID_IMAGE,
        IMG_MGMT_ID_STATE,
        { hash: testHash, confirm: false }
      );
    });

    test('cmdImageConfirm should send image confirm command with hash', () => {
      const testHash = 'abc123';
      manager.cmdImageConfirm(testHash);
      expect(manager._sendMessage).toHaveBeenCalledWith(
        MGMT_OP_WRITE,
        MGMT_GROUP_ID_IMAGE,
        IMG_MGMT_ID_STATE,
        { hash: testHash, confirm: true }
      );
    });
  });

  describe('Upload Functionality', () => {
    beforeEach(() => {
      manager._sendMessage = jest.fn();
      manager._imageUploadProgressCallback = jest.fn();
      manager._imageUploadFinishedCallback = jest.fn();
    });

    test('cmdUpload should reject if upload already in progress', async () => {
      manager._uploadIsInProgress = true;
      const image = new Uint8Array(100).buffer;

      await manager.cmdUpload(image);

      expect(mockLogger.error).toHaveBeenCalledWith('Upload is already in progress.');
      expect(manager._sendMessage).not.toHaveBeenCalled();
    });

    test('cmdUpload should start upload process', async () => {
      const image = new Uint8Array(100).buffer;
      manager._uploadNext = jest.fn();

      await manager.cmdUpload(image, 0);

      expect(manager._uploadIsInProgress).toBe(true);
      expect(manager._uploadOffset).toBe(0);
      expect(manager._uploadImage).toBe(image);
      expect(manager._uploadSlot).toBe(0);
      expect(manager._uploadNext).toHaveBeenCalled();
    });

    test('_uploadNext should finish when all data is uploaded', async () => {
      const image = new Uint8Array(100).buffer;
      manager._uploadImage = image;
      manager._uploadOffset = 100; // At the end
      manager._uploadIsInProgress = true;

      await manager._uploadNext();

      expect(manager._uploadIsInProgress).toBe(false);
      expect(manager._imageUploadFinishedCallback).toHaveBeenCalled();
    });

    test('_uploadNext should send first chunk with metadata', async () => {
      const image = new Uint8Array(100).buffer;
      manager._uploadImage = image;
      manager._uploadOffset = 0;
      manager._uploadIsInProgress = true;

      // Mock CBOR.encode to return predictable size
      global.CBOR.encode.mockReturnValue(new ArrayBuffer(50));

      await manager._uploadNext();

      expect(manager._sendMessage).toHaveBeenCalled();
      expect(manager._imageUploadProgressCallback).toHaveBeenCalledWith({ percentage: 0 });
    });

    test('_uploadNext should report progress correctly', async () => {
      const image = new Uint8Array(1000).buffer;
      manager._uploadImage = image;
      manager._uploadOffset = 500; // 50% uploaded
      manager._uploadIsInProgress = true;

      global.CBOR.encode.mockReturnValue(new ArrayBuffer(50));

      await manager._uploadNext();

      expect(manager._imageUploadProgressCallback).toHaveBeenCalledWith({ percentage: 50 });
    });
  });

  describe('Sequence Number Management', () => {
    beforeEach(() => {
      // Create a real characteristic mock
      manager._characteristic = {
        writeValueWithoutResponse: jest.fn().mockResolvedValue(undefined)
      };
    });

    test('should increment sequence number on each message', async () => {
      expect(manager._seq).toBe(0);

      await manager._sendMessage(MGMT_OP_READ, MGMT_GROUP_ID_OS, OS_MGMT_ID_ECHO, {});
      expect(manager._seq).toBe(1);

      await manager._sendMessage(MGMT_OP_READ, MGMT_GROUP_ID_OS, OS_MGMT_ID_ECHO, {});
      expect(manager._seq).toBe(2);
    });

    test('should wrap sequence number at 256', async () => {
      manager._seq = 255;

      await manager._sendMessage(MGMT_OP_READ, MGMT_GROUP_ID_OS, OS_MGMT_ID_ECHO, {});
      expect(manager._seq).toBe(0);
    });
  });

  describe('Disconnection', () => {
    test('_disconnected should reset device state', async () => {
      const mockCallback = jest.fn();
      manager.onDisconnect(mockCallback);

      manager._device = { name: 'Test' };
      manager._service = {};
      manager._characteristic = {};
      manager._uploadIsInProgress = true;
      manager._userRequestedDisconnect = true;

      await manager._disconnected();

      expect(manager._device).toBeNull();
      expect(manager._service).toBeNull();
      expect(manager._characteristic).toBeNull();
      expect(manager._uploadIsInProgress).toBe(false);
      expect(manager._userRequestedDisconnect).toBe(false);
      expect(mockCallback).toHaveBeenCalled();
    });

    test('disconnect should set user requested flag and disconnect', () => {
      const mockGatt = {
        disconnect: jest.fn()
      };
      manager._device = { gatt: mockGatt };

      manager.disconnect();

      expect(manager._userRequestedDisconnect).toBe(true);
      expect(mockGatt.disconnect).toHaveBeenCalled();
    });
  });

  describe('Constants Export', () => {
    test('should export operation codes', () => {
      expect(MGMT_OP_READ).toBe(0);
      expect(MGMT_OP_WRITE).toBe(2);
    });

    test('should export group IDs', () => {
      expect(MGMT_GROUP_ID_OS).toBe(0);
      expect(MGMT_GROUP_ID_IMAGE).toBe(1);
    });

    test('should export command IDs', () => {
      expect(OS_MGMT_ID_ECHO).toBe(0);
      expect(OS_MGMT_ID_RESET).toBe(5);
      expect(IMG_MGMT_ID_STATE).toBe(0);
      expect(IMG_MGMT_ID_UPLOAD).toBe(1);
      expect(IMG_MGMT_ID_ERASE).toBe(5);
    });
  });
});
