# MCU Manager API Documentation

This document provides comprehensive documentation for the MCUManager JavaScript API.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
  - [Constructor](#constructor)
  - [Connection Methods](#connection-methods)
  - [Event Handlers](#event-handlers)
  - [Image Management Commands](#image-management-commands)
  - [OS Management Commands](#os-management-commands)
  - [Utility Methods](#utility-methods)
- [Error Handling](#error-handling)
- [Examples](#examples)

## Overview

MCUManager provides a JavaScript API for communicating with devices running Mynewt OS over Web Bluetooth. The library implements the Simple Management Protocol (SMP) with CBOR encoding for efficient binary communication.

**Key Features:**
- Firmware upload and verification
- Image state management (test, confirm, erase)
- Device reset and echo commands
- Automatic reconnection on connection loss
- Progress tracking for firmware uploads
- Configurable timeout and retry mechanisms

## Installation

MCUManager is a standalone library with no external dependencies (except the included CBOR library). Simply include the JavaScript files in your HTML:

```html
<script src="js/cbor.js"></script>
<script src="js/mcumgr.js"></script>
```

## Quick Start

```javascript
// Create MCU Manager instance
const mcumgr = new MCUManager();

// Set up event handlers
mcumgr
  .onConnecting(() => console.log('Connecting...'))
  .onConnect(() => console.log('Connected!'))
  .onDisconnect(() => console.log('Disconnected'))
  .onMessage(msg => console.log('Received:', msg))
  .onImageUploadProgress(progress => console.log(`Upload: ${progress.percentage}%`));

// Connect to device
await mcumgr.connect();

// Get image state
await mcumgr.cmdImageState();

// Upload firmware
const imageFile = await fetch('firmware.bin').then(r => r.arrayBuffer());
const imageInfo = await mcumgr.imageInfo(imageFile);
console.log('Image version:', imageInfo.version);
await mcumgr.cmdUpload(imageFile);

// Disconnect
mcumgr.disconnect();
```

## API Reference

### Constructor

#### `new MCUManager(di = {})`

Creates a new MCUManager instance.

**Parameters:**
- `di` (Object, optional): Dependency injection object
  - `logger` (Object, optional): Custom logger with `info` and `error` methods. Defaults to `console.log` and `console.error`.

**Example:**
```javascript
const mcumgr = new MCUManager({
  logger: {
    info: (msg) => myLogger.log(msg),
    error: (msg) => myLogger.error(msg)
  }
});
```

**Properties:**
- `SERVICE_UUID`: BLE Service UUID (`8d53dc1d-1db7-4cd3-868b-8a527460aa84`)
- `CHARACTERISTIC_UUID`: BLE Characteristic UUID (`da2e7828-fbce-4e01-ae9e-261174997c48`)

### Connection Methods

#### `connect(filters)`

Initiates a connection to a BLE device. Opens the browser's device picker if no device was previously selected.

**Parameters:**
- `filters` (Array, optional): Web Bluetooth filters to restrict device selection
  - Example: `[{ name: 'MyDevice' }]` or `[{ services: [serviceUuid] }]`

**Returns:** `Promise<void>`

**Example:**
```javascript
// Connect to any device
await mcumgr.connect();

// Connect to device with specific name
await mcumgr.connect([{ name: 'MyNRF52' }]);

// Connect to device with name prefix
await mcumgr.connect([{ namePrefix: 'NRF' }]);
```

**Behavior:**
- On successful connection, triggers `onConnect` callback
- On disconnection (unless user-initiated), automatically attempts to reconnect after 1 second
- Auto-reconnect continues firmware upload if one was in progress

#### `disconnect()`

Disconnects from the currently connected device. Prevents automatic reconnection.

**Returns:** `Promise<void>`

**Example:**
```javascript
mcumgr.disconnect();
```

### Event Handlers

All event handlers support method chaining and must be set before connecting.

#### `onConnecting(callback)`

Registers a callback to be invoked when connection is being established.

**Parameters:**
- `callback` (Function): Called with no arguments when connecting starts

**Returns:** `MCUManager` (for chaining)

**Example:**
```javascript
mcumgr.onConnecting(() => {
  statusLabel.textContent = 'Connecting...';
});
```

#### `onConnect(callback)`

Registers a callback to be invoked when connection is successfully established.

**Parameters:**
- `callback` (Function): Called with no arguments when connected

**Returns:** `MCUManager` (for chaining)

**Example:**
```javascript
mcumgr.onConnect(() => {
  console.log(`Connected to ${mcumgr.name}`);
  statusLabel.textContent = 'Connected';
});
```

#### `onDisconnect(callback)`

Registers a callback to be invoked when device disconnects.

**Parameters:**
- `callback` (Function): Called with no arguments when disconnected

**Returns:** `MCUManager` (for chaining)

**Example:**
```javascript
mcumgr.onDisconnect(() => {
  statusLabel.textContent = 'Disconnected';
});
```

#### `onMessage(callback)`

Registers a callback to receive all SMP response messages.

**Parameters:**
- `callback` (Function): Called with a message object
  - `op` (Number): Operation code (0=READ, 1=READ_RSP, 2=WRITE, 3=WRITE_RSP)
  - `group` (Number): Management group ID (see [PROTOCOL.md](PROTOCOL.md))
  - `id` (Number): Command ID within the group
  - `data` (Object): Decoded CBOR response data
  - `length` (Number): Payload length in bytes

**Returns:** `MCUManager` (for chaining)

**Example:**
```javascript
mcumgr.onMessage(({ op, group, id, data }) => {
  console.log(`Received group=${group}, id=${id}, data=`, data);

  if (data.rc !== 0 && data.rc !== undefined) {
    console.error('Command failed with return code:', data.rc);
  }
});
```

#### `onImageUploadProgress(callback)`

Registers a callback to track firmware upload progress.

**Parameters:**
- `callback` (Function): Called periodically during upload with progress object
  - `percentage` (Number): Upload completion percentage (0-100)

**Returns:** `MCUManager` (for chaining)

**Example:**
```javascript
mcumgr.onImageUploadProgress(({ percentage }) => {
  progressBar.value = percentage;
  progressLabel.textContent = `${percentage}%`;
});
```

#### `onImageUploadFinished(callback)`

Registers a callback to be invoked when firmware upload completes.

**Parameters:**
- `callback` (Function): Called with no arguments when upload finishes

**Returns:** `MCUManager` (for chaining)

**Example:**
```javascript
mcumgr.onImageUploadFinished(() => {
  console.log('Upload complete!');
  statusLabel.textContent = 'Upload finished';
});
```

### Image Management Commands

#### `cmdImageState()`

Requests the current image state from the device. Response includes information about all image slots.

**Returns:** `Promise<void>`

**Response (via `onMessage`):**
```javascript
{
  images: [
    {
      slot: 0,
      version: "1.0.0",
      hash: <Uint8Array>,
      bootable: true,
      pending: false,
      confirmed: true,
      active: true,
      permanent: false
    },
    // ... more slots
  ]
}
```

**Example:**
```javascript
mcumgr.onMessage(({ group, id, data }) => {
  if (group === 1 && id === 0) { // Image State
    console.log('Images:', data.images);
  }
});

await mcumgr.cmdImageState();
```

#### `cmdImageTest(hash)`

Marks an image for testing on next boot. The image will be tried once; if not confirmed, the device reverts to the previous image.

**Parameters:**
- `hash` (Uint8Array): SHA-256 hash of the image to test

**Returns:** `Promise<void>`

**Example:**
```javascript
const info = await mcumgr.imageInfo(firmwareBuffer);
const hashBytes = new Uint8Array(
  info.hash.match(/.{2}/g).map(byte => parseInt(byte, 16))
);
await mcumgr.cmdImageTest(hashBytes);
```

#### `cmdImageConfirm(hash)`

Permanently confirms an image. The image will boot on all subsequent resets.

**Parameters:**
- `hash` (Uint8Array): SHA-256 hash of the image to confirm

**Returns:** `Promise<void>`

**Example:**
```javascript
const info = await mcumgr.imageInfo(firmwareBuffer);
const hashBytes = new Uint8Array(
  info.hash.match(/.{2}/g).map(byte => parseInt(byte, 16))
);
await mcumgr.cmdImageConfirm(hashBytes);
```

#### `cmdImageErase()`

Erases the secondary image slot. This frees up flash memory.

**Returns:** `Promise<void>`

**Note:** This operation can take several hundred milliseconds. The default timeout is 500ms to prevent retries that can cause issues on some devices.

**Example:**
```javascript
await mcumgr.cmdImageErase();
```

#### `cmdUpload(image, slot = 0)`

Uploads a firmware image to the device. The upload is chunked automatically based on MTU size.

**Parameters:**
- `image` (ArrayBuffer): Firmware image binary data
- `slot` (Number, optional): Target slot number (default: 0)

**Returns:** `Promise<void>`

**Behavior:**
- Automatically chunks the image based on MTU (400 bytes default)
- Includes SHA-256 hash verification
- Triggers `onImageUploadProgress` callbacks during upload
- Triggers `onImageUploadFinished` callback when complete
- Automatically retries chunks that timeout (500ms default)
- Resumes upload after reconnection if connection is lost

**Example:**
```javascript
const fileInput = document.getElementById('firmware-file');
const file = fileInput.files[0];
const imageBuffer = await file.arrayBuffer();

// Validate image before upload
const info = await mcumgr.imageInfo(imageBuffer);
console.log(`Uploading version ${info.version}, size ${info.imageSize} bytes`);

// Upload
await mcumgr.cmdUpload(imageBuffer);
```

#### `imageInfo(image)`

Parses and validates an MCUboot firmware image file.

**Parameters:**
- `image` (ArrayBuffer): Firmware image binary data

**Returns:** `Promise<Object>`
- `version` (String): Firmware version (e.g., "1.0.0")
- `imageSize` (Number): Image size in bytes (excluding header)
- `hash` (String): SHA-256 hash as hex string

**Throws:** `Error` if image is invalid
- "Invalid image (too short file)" - File is less than 32 bytes
- "Invalid image (wrong magic bytes)" - Not a valid MCUboot image
- "Invalid image (wrong load address)" - Load address is not 0x00000000
- "Invalid image (wrong protected TLV area size)" - Protected TLV size is not 0
- "Invalid image (wrong image size)" - File size doesn't match header
- "Invalid image (wrong flags)" - Flags field is not 0x00000000

**Example:**
```javascript
try {
  const info = await mcumgr.imageInfo(imageBuffer);
  console.log(`Version: ${info.version}`);
  console.log(`Size: ${info.imageSize} bytes`);
  console.log(`Hash: ${info.hash}`);
} catch (error) {
  console.error('Invalid firmware image:', error.message);
}
```

### OS Management Commands

#### `cmdReset()`

Resets the device. The device will disconnect and reboot.

**Returns:** `Promise<void>`

**Example:**
```javascript
await mcumgr.cmdReset();
// Device will disconnect and reboot
```

#### `smpEcho(message)`

Sends an echo command to test SMP communication. The device should respond with the same message.

**Parameters:**
- `message` (String): Message to echo

**Returns:** `Promise<void>`

**Response (via `onMessage`):**
```javascript
{
  r: "your message"
}
```

**Example:**
```javascript
mcumgr.onMessage(({ group, id, data }) => {
  if (group === 0 && id === 0) { // OS Echo
    console.log('Echo response:', data.r);
  }
});

await mcumgr.smpEcho('Hello, device!');
```

### Utility Methods

#### `name` (getter)

Returns the connected device's Bluetooth name.

**Returns:** `String | null` - Device name or `null` if not connected

**Example:**
```javascript
console.log('Connected to:', mcumgr.name);
```

## Error Handling

### Return Codes

All SMP responses include an `rc` (return code) field:

- `rc === 0` or `rc === undefined`: Success
- `rc !== 0`: Error occurred

**Common Error Codes:**
- `0`: Success (MGMT_ERR_EOK)
- `1`: Unknown error (MGMT_ERR_EUNKNOWN)
- `2`: Out of memory (MGMT_ERR_ENOMEM)
- `3`: Invalid value (MGMT_ERR_EINVAL)
- `4`: Timeout (MGMT_ERR_ETIMEOUT)
- `5`: No entry (MGMT_ERR_ENOENT)
- `6`: Bad state (MGMT_ERR_EBADSTATE)
- `7`: Response too large (MGMT_ERR_EMSGSIZE)
- `8`: Not supported (MGMT_ERR_ENOTSUP)
- `9`: Corruption detected (MGMT_ERR_ECORRUPT)
- `10`: Operation busy (MGMT_ERR_EBUSY)

**Note:** Some devices (e.g., NRF52.4) may return `rc === undefined` for successful operations. The library handles both cases.

**Example:**
```javascript
mcumgr.onMessage(({ data }) => {
  if (data.rc && data.rc !== 0) {
    console.error('Command failed with error code:', data.rc);
    // Handle error...
  } else {
    console.log('Command succeeded');
  }
});
```

### Connection Errors

Connection errors are logged via the configured logger. Common issues:

- **User cancelled device selection**: User closed the browser's device picker
- **Device not found**: No devices match the specified filters
- **GATT connection failed**: Bluetooth communication error
- **Service not found**: Device doesn't support MCU Manager service
- **Characteristic not found**: Invalid service implementation

### Image Validation Errors

The `imageInfo()` method validates firmware images and throws descriptive errors. Always validate images before uploading:

```javascript
try {
  const info = await mcumgr.imageInfo(imageBuffer);
  await mcumgr.cmdUpload(imageBuffer);
} catch (error) {
  alert('Invalid firmware: ' + error.message);
}
```

## Examples

### Complete Firmware Update Flow

```javascript
const mcumgr = new MCUManager();

// Setup callbacks
mcumgr
  .onConnect(async () => {
    console.log('Connected!');

    // Get current image state
    await mcumgr.cmdImageState();
  })
  .onMessage(({ group, id, data }) => {
    if (group === 1 && id === 0) { // Image State
      console.log('Current images:', data.images);
    }
  })
  .onImageUploadProgress(({ percentage }) => {
    console.log(`Upload progress: ${percentage}%`);
  })
  .onImageUploadFinished(async () => {
    console.log('Upload complete!');

    // Test the new image
    const info = await mcumgr.imageInfo(firmwareBuffer);
    const hashBytes = new Uint8Array(
      info.hash.match(/.{2}/g).map(byte => parseInt(byte, 16))
    );

    await mcumgr.cmdImageTest(hashBytes);
    console.log('Image marked for testing');

    // Reset device to boot new image
    await mcumgr.cmdReset();
  });

// Connect and upload
await mcumgr.connect();

const fileInput = document.getElementById('file-input');
const file = fileInput.files[0];
const firmwareBuffer = await file.arrayBuffer();

// Validate image
const info = await mcumgr.imageInfo(firmwareBuffer);
console.log(`Uploading firmware v${info.version}`);

// Upload
await mcumgr.cmdUpload(firmwareBuffer);
```

### Testing SMP Echo

```javascript
const mcumgr = new MCUManager();

mcumgr.onMessage(({ group, id, data }) => {
  if (group === 0 && id === 0) {
    console.log('Device responded:', data.r);
  }
});

await mcumgr.connect();
await mcumgr.smpEcho('Hello from browser!');
```

### Confirming an Image After Testing

```javascript
// After device has rebooted with test image and it's working correctly...

mcumgr.onConnect(async () => {
  // Get image state to find the active image hash
  await mcumgr.cmdImageState();
});

mcumgr.onMessage(async ({ group, id, data }) => {
  if (group === 1 && id === 0) {
    const activeImage = data.images.find(img => img.active);

    if (!activeImage.confirmed) {
      // Confirm the currently running image
      await mcumgr.cmdImageConfirm(activeImage.hash);
      console.log('Image confirmed permanently');
    }
  }
});

await mcumgr.connect();
```

### Custom Logger Integration

```javascript
// Integrate with your logging framework
const mcumgr = new MCUManager({
  logger: {
    info: (msg) => myApp.log.info('MCUManager', msg),
    error: (msg) => myApp.log.error('MCUManager', msg)
  }
});
```

## See Also

- [PROTOCOL.md](PROTOCOL.md) - SMP Protocol specification
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contributing guide
- [README.md](README.md) - Project overview and browser compatibility
