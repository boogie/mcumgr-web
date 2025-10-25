# MCU Manager (Web Bluetooth)

This tool is the Web Bluetooth version of MCU Manager that enables a user to communicate with and manage remote devices running the Mynewt OS. It uses a connection profile to establish a connection with a device and sends command requests to the device.

The main focus is implementing firmware updates via Web Bluetooth, however other commands might be supported as well.

The Web Bluetooth API provides the ability to connect and interact with Bluetooth Low Energy peripherals. You’ll find Web Bluetooth:
- on the desktop (or laptop) in Chrome, Edge and Opera browsers (make sure you have the latest)
- on Android phones in Chrome (perhaps in Edge or Opera?)
- on iOS or iPadOS there is [Bluefy](https://apps.apple.com/hu/app/bluefy-web-ble-browser/id1492822055) that seems to be working.

Safari, Chrome, Edge and Opera on iOS are using the Safari WebKit engine which not yet supports Web Bluetooth. Mobile and desktop Firefox is not implemented it yet, too.

You can try MCU Manager by visiting https://boogie.github.io/mcumgr-web/ with a supported browser. For security reasons, Web Bluetooth is only working on https addresses or localhost.

## Setting up on your machine

You will need a web server to serve the files. If you have Python, just start `python -m http.server 8000` in the project's root, and you can visit http://localhost:8000/.

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
