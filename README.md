# MCU Manager (Web Bluetooth)

This tool is the Web Bluetooth version of MCU Manager that enables a user to communicate with and manage remote devices running the Mynewt OS. It uses a connection profile to establish a connection with a device and sends command requests to the device.

The main focus is implementing firmware updates via Web Bluetooth, however other commands might be supported as well.

## Features

- **Firmware Upload**: Upload MCUboot-formatted firmware images over Bluetooth LE
- **Image Management**: Test, confirm, and erase firmware images
- **Device Control**: Reset device, send echo commands
- **Progress Tracking**: Real-time upload progress updates
- **Auto-Reconnect**: Automatic reconnection and upload resumption on connection loss
- **Image Validation**: Pre-upload validation of MCUboot image format

## Quick Start

Try MCU Manager by visiting **https://boogie.github.io/mcumgr-web/** with a supported browser.

For security reasons, Web Bluetooth only works on HTTPS addresses or localhost.

## Browser Compatibility

The Web Bluetooth API provides the ability to connect and interact with Bluetooth Low Energy peripherals.

### Compatibility Matrix

| Platform | Browser | Support | Notes |
|----------|---------|---------|-------|
| **Windows** | Chrome | ✅ Full | Recommended |
| **Windows** | Edge | ✅ Full | Chromium-based |
| **Windows** | Opera | ✅ Full | Chromium-based |
| **Windows** | Firefox | ❌ No | Not implemented |
| **macOS** | Chrome | ✅ Full | Recommended |
| **macOS** | Edge | ✅ Full | Chromium-based |
| **macOS** | Opera | ✅ Full | Chromium-based |
| **macOS** | Safari | ❌ No | Web Bluetooth not supported |
| **macOS** | Firefox | ❌ No | Not implemented |
| **Linux** | Chrome | ✅ Full | Recommended |
| **Linux** | Edge | ✅ Full | Chromium-based |
| **Linux** | Opera | ✅ Full | Chromium-based |
| **Linux** | Firefox | ❌ No | Not implemented |
| **Android** | Chrome | ✅ Full | Recommended |
| **Android** | Edge | ⚠️ Possible | Untested, likely works |
| **Android** | Opera | ⚠️ Possible | Untested, likely works |
| **Android** | Firefox | ❌ No | Not implemented |
| **iOS / iPadOS** | Safari | ❌ No | WebKit limitation |
| **iOS / iPadOS** | Chrome | ❌ No | Uses WebKit engine |
| **iOS / iPadOS** | Edge | ❌ No | Uses WebKit engine |
| **iOS / iPadOS** | [Bluefy](https://apps.apple.com/hu/app/bluefy-web-ble-browser/id1492822055) | ✅ Full | Dedicated Web Bluetooth browser |

**Legend:**
- ✅ **Full Support** - Tested and working
- ⚠️ **Possible** - Should work but untested
- ❌ **No Support** - Web Bluetooth not available

**Notes:**
- Safari, Chrome, Edge, and Opera on iOS use the Safari WebKit engine, which does not support Web Bluetooth
- Desktop and mobile Firefox have not implemented Web Bluetooth
- For the best experience, use the latest version of Chrome, Edge, or Opera
- On iOS/iPadOS, use the [Bluefy browser](https://apps.apple.com/hu/app/bluefy-web-ble-browser/id1492822055)

## Documentation

- **[API.md](API.md)** - Complete API reference and usage examples
- **[PROTOCOL.md](PROTOCOL.md)** - SMP protocol specification and MCUboot image format
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Contributing guidelines and development setup

## Setting up on your machine

You will need a web server to serve the files. If you have Python, just start `python -m http.server 8000` in the project's root, and you can visit http://localhost:8000/.

Alternatively, use Node.js:
```bash
npx http-server -p 8000
```

Or PHP:
```bash
php -S localhost:8000
```

## Usage Example

```javascript
// Create MCU Manager instance
const mcumgr = new MCUManager();

// Set up event handlers
mcumgr
  .onConnect(() => console.log('Connected!'))
  .onImageUploadProgress(({ percentage }) =>
    console.log(`Upload: ${percentage}%`)
  );

// Connect to device
await mcumgr.connect();

// Upload firmware
const response = await fetch('firmware.bin');
const imageBuffer = await response.arrayBuffer();
await mcumgr.cmdUpload(imageBuffer);
```

See [API.md](API.md) for complete documentation.

## Development

### Running Tests

This project uses Jest for automated testing. Tests are automatically run on every git commit via pre-commit hooks.

Install dependencies:
```bash
npm install
```

Run tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

Generate coverage report:
```bash
npm run test:coverage
```

### Test Structure

- `__tests__/mcumgr.test.js` - Tests for the MCUManager class (connection, messaging, image upload, validation)
- `__tests__/cbor.test.js` - Tests for CBOR encoding/decoding
- `__tests__/setup.js` - Test environment setup and mocks

The test suite includes 73 tests covering:
- MCUManager class functionality
  - Constructor and dependency injection
  - Callback registration
  - Device connection and disconnection
  - Message protocol (SMP)
  - Image validation and parsing
  - Firmware upload with chunking
  - Command methods (reset, echo, image state, etc.)
  - Sequence number management
- CBOR encoding/decoding
  - Primitive types (boolean, null, undefined)
  - Numbers (integers, floats, large numbers)
  - Strings (ASCII, UTF-8, long strings)
  - Byte arrays
  - Arrays and nested arrays
  - Objects and nested objects
  - Complex MCU Manager message structures

### Pre-commit Hooks

Tests are automatically run before each commit using Husky. If tests fail, the commit will be blocked. This ensures code quality and prevents regressions.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

We're especially looking for help with:
- Testing on different devices and browsers
- Adding support for additional SMP commands
- Improving documentation and examples
- Bug reports and feature requests

## License

See LICENSE file for details.

## Links

- **Live Demo:** https://boogie.github.io/mcumgr-web/
- **MCUboot:** https://www.mcuboot.com/
- **Apache Mynewt:** https://mynewt.apache.org/
- **Web Bluetooth API:** https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API
