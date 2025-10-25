// Load the actual CBOR implementation for testing
const CBOR = require('../js/cbor.js');

describe('CBOR Encoding/Decoding', () => {
  describe('Primitive Types', () => {
    test('should encode and decode boolean false', () => {
      const encoded = CBOR.encode(false);
      const decoded = CBOR.decode(encoded);
      expect(decoded).toBe(false);
    });

    test('should encode and decode boolean true', () => {
      const encoded = CBOR.encode(true);
      const decoded = CBOR.decode(encoded);
      expect(decoded).toBe(true);
    });

    test('should encode and decode null', () => {
      const encoded = CBOR.encode(null);
      const decoded = CBOR.decode(encoded);
      expect(decoded).toBe(null);
    });

    test('should encode and decode undefined', () => {
      const encoded = CBOR.encode(undefined);
      const decoded = CBOR.decode(encoded);
      expect(decoded).toBe(undefined);
    });
  });

  describe('Numbers', () => {
    test('should encode and decode positive integers', () => {
      const testCases = [0, 1, 23, 24, 255, 256, 65535, 65536];
      testCases.forEach(num => {
        const encoded = CBOR.encode(num);
        const decoded = CBOR.decode(encoded);
        expect(decoded).toBe(num);
      });
    });

    test('should encode and decode negative integers', () => {
      const testCases = [-1, -23, -24, -255, -256, -65535, -65536];
      testCases.forEach(num => {
        const encoded = CBOR.encode(num);
        const decoded = CBOR.decode(encoded);
        expect(decoded).toBe(num);
      });
    });

    test('should encode and decode floating point numbers', () => {
      const testCases = [0.5, -0.5, 3.14159, -3.14159, 1.1, -1.1];
      testCases.forEach(num => {
        const encoded = CBOR.encode(num);
        const decoded = CBOR.decode(encoded);
        expect(decoded).toBeCloseTo(num, 5);
      });
    });

    test('should encode and decode large numbers', () => {
      const testCases = [1000000, -1000000, 4294967295];
      testCases.forEach(num => {
        const encoded = CBOR.encode(num);
        const decoded = CBOR.decode(encoded);
        expect(decoded).toBe(num);
      });
    });
  });

  describe('Strings', () => {
    test('should encode and decode empty string', () => {
      const encoded = CBOR.encode('');
      const decoded = CBOR.decode(encoded);
      expect(decoded).toBe('');
    });

    test('should encode and decode ASCII strings', () => {
      const testCases = ['hello', 'world', 'test123', 'The quick brown fox'];
      testCases.forEach(str => {
        const encoded = CBOR.encode(str);
        const decoded = CBOR.decode(encoded);
        expect(decoded).toBe(str);
      });
    });

    test('should encode and decode UTF-8 strings', () => {
      const testCases = ['hello 世界', 'café', 'Здравствуй', '🚀', 'ñoño'];
      testCases.forEach(str => {
        const encoded = CBOR.encode(str);
        const decoded = CBOR.decode(encoded);
        expect(decoded).toBe(str);
      });
    });

    test('should encode and decode long strings', () => {
      const longString = 'a'.repeat(1000);
      const encoded = CBOR.encode(longString);
      const decoded = CBOR.decode(encoded);
      expect(decoded).toBe(longString);
    });
  });

  describe('Byte Arrays', () => {
    test('should encode and decode Uint8Array', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const encoded = CBOR.encode(data);
      const decoded = CBOR.decode(encoded);
      expect(decoded).toBeInstanceOf(Uint8Array);
      expect(Array.from(decoded)).toEqual(Array.from(data));
    });

    test('should encode and decode empty Uint8Array', () => {
      const data = new Uint8Array([]);
      const encoded = CBOR.encode(data);
      const decoded = CBOR.decode(encoded);
      expect(decoded).toBeInstanceOf(Uint8Array);
      expect(decoded.length).toBe(0);
    });

    test('should encode and decode large Uint8Array', () => {
      const data = new Uint8Array(1000);
      for (let i = 0; i < data.length; i++) {
        data[i] = i % 256;
      }
      const encoded = CBOR.encode(data);
      const decoded = CBOR.decode(encoded);
      expect(decoded).toBeInstanceOf(Uint8Array);
      expect(Array.from(decoded)).toEqual(Array.from(data));
    });
  });

  describe('Arrays', () => {
    test('should encode and decode empty array', () => {
      const encoded = CBOR.encode([]);
      const decoded = CBOR.decode(encoded);
      expect(decoded).toEqual([]);
    });

    test('should encode and decode simple arrays', () => {
      const testCases = [
        [1, 2, 3],
        ['a', 'b', 'c'],
        [true, false, null],
        [1, 'two', 3.0, true]
      ];
      testCases.forEach(arr => {
        const encoded = CBOR.encode(arr);
        const decoded = CBOR.decode(encoded);
        expect(decoded).toEqual(arr);
      });
    });

    test('should encode and decode nested arrays', () => {
      const nested = [1, [2, 3], [4, [5, 6]]];
      const encoded = CBOR.encode(nested);
      const decoded = CBOR.decode(encoded);
      expect(decoded).toEqual(nested);
    });
  });

  describe('Objects', () => {
    test('should encode and decode empty object', () => {
      const encoded = CBOR.encode({});
      const decoded = CBOR.decode(encoded);
      expect(decoded).toEqual({});
    });

    test('should encode and decode simple objects', () => {
      const testCases = [
        { a: 1 },
        { a: 1, b: 2, c: 3 },
        { name: 'test', value: 42 },
        { bool: true, str: 'hello', num: 123 }
      ];
      testCases.forEach(obj => {
        const encoded = CBOR.encode(obj);
        const decoded = CBOR.decode(encoded);
        expect(decoded).toEqual(obj);
      });
    });

    test('should encode and decode nested objects', () => {
      const nested = {
        a: 1,
        b: {
          c: 2,
          d: {
            e: 3
          }
        }
      };
      const encoded = CBOR.encode(nested);
      const decoded = CBOR.decode(encoded);
      expect(decoded).toEqual(nested);
    });

    test('should encode and decode objects with arrays', () => {
      const obj = {
        name: 'test',
        values: [1, 2, 3],
        nested: {
          items: ['a', 'b', 'c']
        }
      };
      const encoded = CBOR.encode(obj);
      const decoded = CBOR.decode(encoded);
      expect(decoded).toEqual(obj);
    });
  });

  describe('Complex Structures', () => {
    test('should encode and decode MCU Manager message structure', () => {
      const message = {
        d: 'echo test',
        rc: 0
      };
      const encoded = CBOR.encode(message);
      const decoded = CBOR.decode(encoded);
      expect(decoded).toEqual(message);
    });

    test('should encode and decode image upload message', () => {
      const message = {
        data: new Uint8Array([0x01, 0x02, 0x03, 0x04]),
        off: 1024,
        len: 4096,
        sha: new Uint8Array(32)
      };
      const encoded = CBOR.encode(message);
      const decoded = CBOR.decode(encoded);
      expect(decoded.off).toBe(message.off);
      expect(decoded.len).toBe(message.len);
      expect(Array.from(decoded.data)).toEqual(Array.from(message.data));
      expect(Array.from(decoded.sha)).toEqual(Array.from(message.sha));
    });

    test('should encode and decode image state response', () => {
      const state = {
        images: [
          {
            slot: 0,
            version: '1.0.0',
            hash: new Uint8Array(32),
            bootable: true,
            pending: false,
            confirmed: true,
            active: true,
            permanent: false
          },
          {
            slot: 1,
            version: '1.1.0',
            hash: new Uint8Array(32),
            bootable: true,
            pending: true,
            confirmed: false,
            active: false,
            permanent: false
          }
        ],
        splitStatus: 0
      };
      const encoded = CBOR.encode(state);
      const decoded = CBOR.decode(encoded);
      expect(decoded.images.length).toBe(2);
      expect(decoded.images[0].version).toBe('1.0.0');
      expect(decoded.images[1].version).toBe('1.1.0');
      expect(decoded.splitStatus).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle object with numeric string keys', () => {
      const obj = { '0': 'zero', '1': 'one', '2': 'two' };
      const encoded = CBOR.encode(obj);
      const decoded = CBOR.decode(encoded);
      expect(decoded).toEqual(obj);
    });

    test('should handle mixed data types in arrays', () => {
      const mixed = [
        1,
        'string',
        true,
        null,
        { key: 'value' },
        [1, 2, 3],
        new Uint8Array([4, 5, 6])
      ];
      const encoded = CBOR.encode(mixed);
      const decoded = CBOR.decode(encoded);
      expect(decoded[0]).toBe(1);
      expect(decoded[1]).toBe('string');
      expect(decoded[2]).toBe(true);
      expect(decoded[3]).toBe(null);
      expect(decoded[4]).toEqual({ key: 'value' });
      expect(decoded[5]).toEqual([1, 2, 3]);
      expect(Array.from(decoded[6])).toEqual([4, 5, 6]);
    });
  });

  describe('Binary Format Verification', () => {
    test('should produce correct binary format for simple integer', () => {
      // CBOR encoding of 42 should be 0x182a (major type 0, value 42)
      const encoded = CBOR.encode(42);
      const view = new Uint8Array(encoded);
      expect(view[0]).toBe(0x18); // Type 0, additional info 24 (1-byte uint8 follows)
      expect(view[1]).toBe(42);
    });

    test('should produce correct binary format for empty object', () => {
      // CBOR encoding of {} should be 0xa0 (major type 5, length 0)
      const encoded = CBOR.encode({});
      const view = new Uint8Array(encoded);
      expect(view[0]).toBe(0xa0);
    });

    test('should produce correct binary format for empty array', () => {
      // CBOR encoding of [] should be 0x80 (major type 4, length 0)
      const encoded = CBOR.encode([]);
      const view = new Uint8Array(encoded);
      expect(view[0]).toBe(0x80);
    });
  });

  describe('Module Exports', () => {
    test('should export encode function', () => {
      expect(typeof CBOR.encode).toBe('function');
    });

    test('should export decode function', () => {
      expect(typeof CBOR.decode).toBe('function');
    });
  });
});
