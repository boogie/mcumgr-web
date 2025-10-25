# MCU Manager Protocol Specification

This document describes the Simple Management Protocol (SMP) implementation used by MCUManager for communicating with devices over Bluetooth Low Energy.

## Table of Contents

- [Overview](#overview)
- [SMP Protocol Structure](#smp-protocol-structure)
- [Message Format](#message-format)
- [Management Groups](#management-groups)
- [Image Management Group](#image-management-group)
- [OS Management Group](#os-management-group)
- [CBOR Encoding](#cbor-encoding)
- [MCUboot Image Format](#mcuboot-image-format)
- [Bluetooth Transport](#bluetooth-transport)
- [External References](#external-references)

## Overview

MCU Manager uses the **Simple Management Protocol (SMP)** for device management operations. SMP is a binary protocol that uses CBOR (Concise Binary Object Representation) for efficient encoding of structured data.

**Key Characteristics:**
- Binary protocol with 8-byte header + CBOR payload
- Request/response model
- Organized into management groups (OS, Image, Stats, etc.)
- Transport-agnostic (this implementation uses Bluetooth LE)
- Sequence numbers for matching requests and responses

## SMP Protocol Structure

### Message Format

Every SMP message consists of an 8-byte header followed by a CBOR-encoded payload:

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|    Op Code    |    Flags      |          Length (16-bit)      |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|        Group ID (16-bit)      |  Sequence Num |  Command ID   |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                       CBOR Payload (variable)                 |
|                              ...                              |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

**Header Fields:**

| Byte | Field | Description |
|------|-------|-------------|
| 0 | Op Code | Operation type (read, write, etc.) |
| 1 | Flags | Reserved for future use (currently 0) |
| 2-3 | Length | Payload length in bytes (big-endian) |
| 4-5 | Group ID | Management group identifier (big-endian) |
| 6 | Sequence | Sequence number (0-255, wraps around) |
| 7 | Command ID | Command within the group |
| 8+ | Payload | CBOR-encoded data |

### Operation Codes

```javascript
MGMT_OP_READ       = 0   // Request to read data
MGMT_OP_READ_RSP   = 1   // Response to read request
MGMT_OP_WRITE      = 2   // Request to write/modify data
MGMT_OP_WRITE_RSP  = 3   // Response to write request
```

**Usage:**
- Use `MGMT_OP_READ` to query device state (e.g., get image list)
- Use `MGMT_OP_WRITE` to modify device state (e.g., upload image, reset device)
- Responses use the corresponding `_RSP` operation code

### Sequence Numbers

Sequence numbers (0-255) help match responses to requests:
- Incremented by sender for each new request
- Wraps to 0 after 255
- Receiver echoes the sequence number in the response
- Not used for matching in this implementation (single request at a time)

## Management Groups

SMP organizes commands into functional groups. Each group has its own set of commands.

```javascript
MGMT_GROUP_ID_OS       = 0   // Operating system commands
MGMT_GROUP_ID_IMAGE    = 1   // Image/firmware management
MGMT_GROUP_ID_STAT     = 2   // Statistics
MGMT_GROUP_ID_CONFIG   = 3   // Runtime configuration
MGMT_GROUP_ID_LOG      = 4   // Log management
MGMT_GROUP_ID_CRASH    = 5   // Crash dump management
MGMT_GROUP_ID_SPLIT    = 6   // Split image management
MGMT_GROUP_ID_RUN      = 7   // Runtime information
MGMT_GROUP_ID_FS       = 8   // File system operations
MGMT_GROUP_ID_SHELL    = 9   // Shell command execution
```

**Implementation Status:**
- **Fully implemented:** OS (group 0), Image (group 1)
- **Not implemented:** Other groups (can be added as needed)

## Image Management Group

Group ID: `1` (MGMT_GROUP_ID_IMAGE)

Commands for managing firmware images on the device.

### Command IDs

```javascript
IMG_MGMT_ID_STATE    = 0   // Get/set image state
IMG_MGMT_ID_UPLOAD   = 1   // Upload image data
IMG_MGMT_ID_FILE     = 2   // File operations (not implemented)
IMG_MGMT_ID_CORELIST = 3   // Core dump list (not implemented)
IMG_MGMT_ID_CORELOAD = 4   // Load core dump (not implemented)
IMG_MGMT_ID_ERASE    = 5   // Erase secondary slot
```

### Image State (ID 0)

**Read Request:**
```
Op: MGMT_OP_READ (0)
Group: MGMT_GROUP_ID_IMAGE (1)
ID: IMG_MGMT_ID_STATE (0)
Payload: {} (empty or omitted)
```

**Response:**
```javascript
{
  "images": [
    {
      "slot": 0,              // Slot number
      "version": "1.0.0",     // Firmware version string
      "hash": <bytes>,        // SHA-256 hash (32 bytes)
      "bootable": true,       // Image is bootable
      "pending": false,       // Pending swap
      "confirmed": true,      // Permanently confirmed
      "active": true,         // Currently running
      "permanent": false      // Permanent flag
    },
    // Additional slots...
  ],
  "splitStatus": 0            // Split image status (optional)
}
```

**Write Request (Test Image):**
```javascript
{
  "hash": <Uint8Array>,       // Image hash to test
  "confirm": false            // false = test, true = confirm
}
```

**Write Request (Confirm Image):**
```javascript
{
  "hash": <Uint8Array>,       // Image hash to confirm
  "confirm": true
}
```

### Image Upload (ID 1)

Uploads firmware image in chunks.

**Request (First Chunk):**
```javascript
{
  "data": <Uint8Array>,       // Image chunk data
  "len": 123456,              // Total image size (first chunk only)
  "off": 0,                   // Offset in image (starts at 0)
  "sha": <Uint8Array>         // SHA-256 of complete image (first chunk only)
}
```

**Request (Subsequent Chunks):**
```javascript
{
  "data": <Uint8Array>,       // Image chunk data
  "off": 512                  // Current offset
}
```

**Response:**
```javascript
{
  "rc": 0,                    // Return code (0 = success)
  "off": 512                  // Next expected offset
}
```

**Upload Process:**
1. Client sends first chunk with `len`, `sha`, `off=0`, and `data`
2. Device responds with next expected `off`
3. Client sends subsequent chunks with `off` and `data`
4. Repeat until `off >= len`
5. Device validates SHA-256 hash

**Chunk Size Calculation:**
```javascript
// Maximum chunk size based on MTU
const nmpOverhead = 8;  // SMP header
const maxChunkSize = MTU - CBOR_encode(message).length - nmpOverhead;
```

### Image Erase (ID 5)

Erases the secondary image slot.

**Request:**
```javascript
{} // Empty object or omitted
```

**Response:**
```javascript
{
  "rc": 0  // Return code
}
```

**Note:** This operation can take 500ms or more on some devices. The implementation uses a 500ms timeout to prevent unnecessary retries.

## OS Management Group

Group ID: `0` (MGMT_GROUP_ID_OS)

Commands for operating system control and diagnostics.

### Command IDs

```javascript
OS_MGMT_ID_ECHO              = 0   // Echo test
OS_MGMT_ID_CONS_ECHO_CTRL    = 1   // Console echo control (not implemented)
OS_MGMT_ID_TASKSTAT          = 2   // Task statistics (not implemented)
OS_MGMT_ID_MPSTAT            = 3   // Memory pool stats (not implemented)
OS_MGMT_ID_DATETIME_STR      = 4   // Date/time string (not implemented)
OS_MGMT_ID_RESET             = 5   // Reset device
```

### Echo (ID 0)

Tests SMP communication by echoing back a message.

**Request:**
```javascript
{
  "d": "Hello, device!"  // Message to echo
}
```

**Response:**
```javascript
{
  "r": "Hello, device!"  // Echoed message
}
```

### Reset (ID 5)

Resets the device.

**Request:**
```javascript
{} // Empty object or omitted
```

**Response:**
```javascript
{
  "rc": 0  // Return code
}
```

**Note:** Device will disconnect shortly after sending response.

## CBOR Encoding

SMP uses CBOR (RFC 7049) for efficient binary encoding of structured data.

**Advantages:**
- Compact binary representation
- Self-describing format
- Supports common data types (integers, strings, arrays, maps, byte strings)
- Efficient for embedded systems

**Implementation:**
This project uses the `cbor.js` library (by Patrick Gansterer, MIT license) for encoding and decoding.

**Example:**
```javascript
// Encode JavaScript object to CBOR bytes
const data = { off: 512, data: new Uint8Array([1, 2, 3]) };
const encoded = CBOR.encode(data);

// Decode CBOR bytes to JavaScript object
const decoded = CBOR.decode(encoded.buffer);
```

## MCUboot Image Format

MCU Manager expects firmware images in the **MCUboot** format. MCUboot is a secure bootloader for 32-bit microcontrollers.

### Image Structure

```
+-------------------+
| MCUboot Header    | 32 bytes minimum
+-------------------+
| Application Code  | Variable size
+-------------------+
| TLV Area          | Variable size (metadata)
+-------------------+
```

### Header Format (32 bytes minimum)

| Offset | Size | Field | Value | Description |
|--------|------|-------|-------|-------------|
| 0 | 4 | Magic | 0x96f3b83d | MCUboot magic number (little-endian) |
| 4 | 4 | Load Address | 0x00000000 | Base address for loading |
| 8 | 2 | Header Size | Variable | Size of this header |
| 10 | 2 | Protected TLV | 0x0000 | Must be 0 |
| 12 | 4 | Image Size | Variable | Size of application code (excludes header) |
| 16 | 4 | Flags | 0x00000000 | Must be 0 |
| 20 | 1 | Version Major | 0-255 | Major version number |
| 21 | 1 | Version Minor | 0-255 | Minor version number |
| 22 | 2 | Version Revision | 0-65535 | Revision number (little-endian) |
| 24 | 4 | Build Number | Variable | Build number (not parsed) |
| 28+ | Variable | Padding | 0x00 | Padding to header size |

### Image Validation

The `imageInfo()` method validates these fields:

```javascript
// Check magic bytes (little-endian 0x96f3b83d)
if (view[0] !== 0x3d || view[1] !== 0xb8 ||
    view[2] !== 0xf3 || view[3] !== 0x96) {
  throw new Error('Invalid image (wrong magic bytes)');
}

// Check load address is 0x00000000
if (view[4] !== 0x00 || view[5] !== 0x00 ||
    view[6] !== 0x00 || view[7] !== 0x00) {
  throw new Error('Invalid image (wrong load address)');
}

// Check protected TLV area size is 0
if (view[10] !== 0x00 || view[11] !== 0x00) {
  throw new Error('Invalid image (wrong protected TLV area size)');
}

// Check flags is 0x00000000
if (view[16] !== 0x00 || view[17] !== 0x00 ||
    view[18] !== 0x00 || view[19] !== 0x00) {
  throw new Error('Invalid image (wrong flags)');
}
```

### Version Parsing

```javascript
const major = view[20];
const minor = view[21];
const revision = view[22] + view[23] * 256; // little-endian
const version = `${major}.${minor}.${revision}`;
```

### Hash Calculation

The hash includes only the header and image data (not the TLV area):

```javascript
const headerSize = view[8] + view[9] * 256;
const imageSize = view[12] + view[13] * 256 +
                  view[14] * 65536 + view[15] * 16777216;
const hashData = image.slice(0, imageSize + headerSize);
const hash = await crypto.subtle.digest('SHA-256', hashData);
```

## Bluetooth Transport

### Service and Characteristic UUIDs

MCU Manager uses standard UUIDs for the SMP service:

```javascript
SERVICE_UUID = '8d53dc1d-1db7-4cd3-868b-8a527460aa84'
CHARACTERISTIC_UUID = 'da2e7828-fbce-4e01-ae9e-261174997c48'
```

### Communication Flow

**Connection:**
1. User selects device via `navigator.bluetooth.requestDevice()`
2. Connect to GATT server: `device.gatt.connect()`
3. Get SMP service: `server.getPrimaryService(SERVICE_UUID)`
4. Get SMP characteristic: `service.getCharacteristic(CHARACTERISTIC_UUID)`
5. Enable notifications: `characteristic.startNotifications()`

**Sending Commands:**
1. Construct SMP header (8 bytes)
2. Encode payload with CBOR
3. Concatenate header + payload
4. Write to characteristic: `characteristic.writeValueWithoutResponse(data)`

**Receiving Responses:**
1. Listen for `characteristicvaluechanged` events
2. Accumulate data in buffer (responses may be fragmented)
3. Check if complete message received (based on Length field)
4. Decode CBOR payload
5. Process response

### MTU Considerations

**Default MTU:** 23 bytes (Bluetooth LE minimum)
- Usable payload: 20 bytes (23 - 3 byte ATT overhead)
- Too small for efficient firmware upload

**Negotiated MTU:** 400+ bytes (typical for modern devices)
- Allows larger chunks
- Improves upload speed
- Automatically negotiated by browser

**This implementation assumes:** MTU of 400 bytes (configurable via `_mtu` property)

### Reconnection Behavior

**Automatic Reconnection:**
- On unexpected disconnect, library automatically reconnects after 1 second (configurable)
- Firmware upload resumes from last acknowledged offset
- User-initiated disconnects do not trigger reconnection

**Benefits:**
- Resilient to temporary connection issues
- Transparent to user during long uploads
- No data loss on reconnection

## Return Codes

All SMP responses include an `rc` (return code) field indicating success or failure.

### Standard Return Codes

| Code | Name | Description |
|------|------|-------------|
| 0 | MGMT_ERR_EOK | Success |
| 1 | MGMT_ERR_EUNKNOWN | Unknown error |
| 2 | MGMT_ERR_ENOMEM | Out of memory |
| 3 | MGMT_ERR_EINVAL | Invalid value/parameter |
| 4 | MGMT_ERR_ETIMEOUT | Operation timed out |
| 5 | MGMT_ERR_ENOENT | No such entry/file |
| 6 | MGMT_ERR_EBADSTATE | Bad state for operation |
| 7 | MGMT_ERR_EMSGSIZE | Response too large |
| 8 | MGMT_ERR_ENOTSUP | Operation not supported |
| 9 | MGMT_ERR_ECORRUPT | Data corruption detected |
| 10 | MGMT_ERR_EBUSY | Resource busy |
| 11 | MGMT_ERR_EACCESSDENIED | Access denied |
| 12 | MGMT_ERR_UNSUPPORTED_TOO_OLD | Unsupported format (too old) |
| 13 | MGMT_ERR_UNSUPPORTED_TOO_NEW | Unsupported format (too new) |

### Device-Specific Behavior

**NRF52 Quirk:** Some NRF52.4 devices return `rc: undefined` instead of `rc: 0` for successful operations.

**Handling:**
```javascript
if (data.rc === 0 || data.rc === undefined) {
  // Success
} else {
  // Error
}
```

## External References

### Official Documentation

- **MCUboot Documentation:** https://www.mcuboot.com/
- **MCUboot GitHub:** https://github.com/mcu-tools/mcuboot
- **Apache Mynewt:** https://mynewt.apache.org/
- **Mynewt Newtmgr (CLI tool):** https://mynewt.apache.org/latest/newtmgr/index.html

### Technical Resources

- **MCUboot Image Format:** https://interrupt.memfault.com/blog/mcuboot-overview#mcuboot-image-binaries
- **CBOR Specification (RFC 7049):** https://tools.ietf.org/html/rfc7049
- **Web Bluetooth API:** https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API
- **Web Bluetooth Specification:** https://webbluetoothcg.github.io/web-bluetooth/

### Related Tools

- **mcumgr CLI:** https://github.com/apache/mynewt-mcumgr-cli (Go-based CLI tool)
- **nRF Connect:** https://www.nordicsemi.com/Products/Development-tools/nrf-connect-for-desktop (Nordic's device management tool)
- **MCUmgr Android:** https://github.com/JuulLabs-OSS/mcumgr-android (Android library)
- **MCUmgr iOS:** https://github.com/JuulLabs-OSS/mcumgr-ios (iOS library)

### SMP Protocol References

The SMP protocol is defined in the Mynewt/Zephyr projects:

- **Zephyr SMP Server:** https://docs.zephyrproject.org/latest/services/device_mgmt/smp_protocol.html
- **Mynewt Image Manager:** https://github.com/apache/mynewt-core/tree/master/mgmt/imgmgr

### Example Firmware

For testing, you'll need firmware built with MCUboot support:

- **Mynewt Examples:** https://github.com/apache/mynewt-core/tree/master/apps
- **Zephyr SMP Sample:** https://github.com/zephyrproject-rtos/zephyr/tree/main/samples/subsys/mgmt/mcumgr

## Protocol Extensions

This implementation focuses on firmware update use cases (Image and OS groups). The SMP protocol supports additional groups that could be implemented:

- **Statistics (group 2):** Query device statistics
- **Configuration (group 3):** Runtime configuration
- **Logging (group 4):** Remote log access
- **File System (group 8):** File upload/download
- **Shell (group 9):** Remote shell commands

See [CONTRIBUTING.md](CONTRIBUTING.md) for information on adding new protocol features.
