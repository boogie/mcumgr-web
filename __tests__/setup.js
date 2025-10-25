// Test setup file for Jest

// Mock Web Crypto API
if (!global.crypto) {
  global.crypto = {};
}
if (!global.crypto.subtle) {
  global.crypto.subtle = {};
}
global.crypto.subtle.digest = jest.fn(async (algorithm, data) => {
  // Simple mock SHA-256 for testing
  // Returns a consistent hash for testing purposes
  const buffer = new ArrayBuffer(32);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < 32; i++) {
    view[i] = i;
  }
  return buffer;
});

// Mock Web Bluetooth API
global.navigator = {
  bluetooth: {
    requestDevice: jest.fn()
  }
};

// Mock CBOR globally for tests (will be overridden in cbor.test.js)
// This is a simple mock for MCUManager tests that don't need real CBOR
if (!global.CBOR) {
  global.CBOR = {
    encode: jest.fn((data) => {
      // Simple mock encode - returns empty buffer for tests
      return new ArrayBuffer(0);
    }),
    decode: jest.fn((data) => {
      // Simple mock decode - returns empty object for tests
      return {};
    })
  };
}

// Suppress console logs during tests unless needed
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
};
