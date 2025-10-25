# Contributing to MCU Manager Web

Thank you for your interest in contributing to MCU Manager Web! This document provides guidelines and information for contributors.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Code Structure](#code-structure)
- [Testing](#testing)
- [Coding Standards](#coding-standards)
- [Submitting Changes](#submitting-changes)
- [Adding New Features](#adding-new-features)
- [Reporting Bugs](#reporting-bugs)
- [Contact](#contact)

## Getting Started

MCU Manager Web is a browser-based tool for managing devices running Mynewt OS via Web Bluetooth. Before contributing, please:

1. Read the [README.md](README.md) for project overview
2. Review the [API.md](API.md) for API documentation
3. Understand the [PROTOCOL.md](PROTOCOL.md) for SMP protocol details
4. Check existing issues and pull requests to avoid duplication

## Development Setup

### Prerequisites

- A Web Bluetooth-enabled browser:
  - Desktop: Chrome, Edge, or Opera (latest version)
  - Android: Chrome browser
  - iOS/iPadOS: Bluefy browser
- A local web server (required for Web Bluetooth security restrictions)
- A compatible Bluetooth LE device running Mynewt OS with SMP support
- Optional: A firmware image in MCUboot format for testing uploads

### Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/boogie/mcumgr-web.git
   cd mcumgr-web
   ```

2. **Start a local web server:**

   Using Python:
   ```bash
   python -m http.server 8000
   ```

   Or using Node.js (with `http-server`):
   ```bash
   npx http-server -p 8000
   ```

   Or using PHP:
   ```bash
   php -S localhost:8000
   ```

3. **Open in your browser:**
   ```
   http://localhost:8000
   ```

4. **Enable Bluetooth logging (optional):**

   In Chrome, enable Bluetooth logging to debug connection issues:
   ```
   chrome://bluetooth-internals/
   ```

### Testing Device

For testing, you'll need a Bluetooth LE device with:
- Mynewt OS or Zephyr OS
- MCUboot bootloader
- SMP server enabled
- Standard MCU Manager service UUID

**Recommended test devices:**
- Nordic nRF52 DK (nRF52832 or nRF52840)
- ESP32 with Zephyr
- STM32 with Mynewt

## Code Structure

```
mcumgr-web/
├── index.html          # Main UI (81 lines)
├── css/
│   └── mcumgr.css      # Custom styles
├── js/
│   ├── mcumgr.js       # Core MCUManager class (310 lines)
│   ├── index.js        # UI event handlers (194 lines)
│   └── cbor.js         # CBOR library (external, 405 lines)
├── API.md              # API documentation
├── PROTOCOL.md         # Protocol specification
├── CONTRIBUTING.md     # This file
└── README.md           # Project overview
```

### Key Files

**`js/mcumgr.js`** - Core library
- `MCUManager` class - Main API
- SMP protocol implementation
- Bluetooth communication layer
- Image upload logic
- Image validation

**`js/index.js`** - User interface
- Event handlers for UI interactions
- Image upload workflow
- State management for UI elements

**`index.html`** - Web interface
- Bootstrap-based UI
- File upload controls
- Connection status display
- Image state display

## Testing

### Manual Testing Checklist

Before submitting changes, test the following scenarios:

#### Basic Connection
- [ ] Connect to device (with and without filters)
- [ ] Device name displays correctly
- [ ] Disconnect works properly
- [ ] Reconnect after user-initiated disconnect works
- [ ] Auto-reconnect after connection loss works

#### Image Management
- [ ] Upload a valid firmware image
- [ ] Upload progress updates correctly (0-100%)
- [ ] Upload completes successfully
- [ ] Upload resumes after reconnection
- [ ] Image validation catches invalid files:
  - [ ] Wrong magic bytes
  - [ ] Wrong load address
  - [ ] Wrong flags
  - [ ] File too short
  - [ ] Wrong protected TLV size
- [ ] `cmdImageState()` returns image list
- [ ] `cmdImageTest()` marks image for testing
- [ ] `cmdImageConfirm()` confirms image
- [ ] `cmdImageErase()` erases secondary slot

#### OS Commands
- [ ] `smpEcho()` echoes message correctly
- [ ] `cmdReset()` resets device

#### Error Handling
- [ ] Connection errors are logged
- [ ] Upload timeout triggers retry
- [ ] Invalid image shows error message
- [ ] Device errors (rc != 0) are handled

#### Browser Compatibility
Test on multiple browsers if possible:
- [ ] Chrome (desktop)
- [ ] Edge (desktop)
- [ ] Opera (desktop)
- [ ] Chrome (Android)
- [ ] Bluefy (iOS/iPadOS)

### Automated Testing

Currently, there are no automated tests. Contributions to add unit tests or integration tests are welcome!

**Potential testing frameworks:**
- Jest for unit tests
- Puppeteer for browser automation
- Web Bluetooth Test API for mocking

### Test Devices

If you don't have a physical device, you can help by:
- Reviewing code and documentation
- Testing on different browsers/platforms
- Reporting compatibility issues
- Improving error messages and user experience

## Coding Standards

### JavaScript Style

- **Modern JavaScript:** Use ES6+ features (async/await, const/let, arrow functions, classes)
- **Indentation:** 4 spaces (no tabs)
- **Naming:**
  - Classes: `PascalCase` (e.g., `MCUManager`)
  - Public methods: `camelCase` (e.g., `cmdImageState`)
  - Private methods/properties: Prefix with `_` (e.g., `_sendMessage`, `_mtu`)
  - Constants: `UPPER_SNAKE_CASE` (e.g., `MGMT_OP_READ`)
- **Comments:**
  - Add comments for complex logic
  - Document public APIs
  - Include references to external specifications
- **Error Handling:**
  - Use try/catch for async operations
  - Provide descriptive error messages
  - Log errors via the configured logger

### Example Code

```javascript
// Good: Async/await, descriptive names, error handling
async connect(filters) {
    try {
        this._device = await this._requestDevice(filters);
        this._logger.info(`Connecting to device ${this.name}...`);
        // ... connection logic
    } catch (error) {
        this._logger.error(error);
        await this._disconnected();
        return;
    }
}

// Good: Private method, clear purpose
_processMessage(message) {
    const [op, _flags, length_hi, length_lo, group_hi, group_lo, _seq, id] = message;
    const data = CBOR.decode(message.slice(8).buffer);
    // ... processing logic
}
```

### HTML/CSS Style

- **Indentation:** 2 spaces for HTML
- **Bootstrap:** Use Bootstrap classes where possible to maintain consistency
- **Accessibility:** Include ARIA labels, semantic HTML, keyboard navigation

## Submitting Changes

### Pull Request Process

1. **Fork the repository** and create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes:**
   - Follow coding standards
   - Test thoroughly (see [Testing](#testing))
   - Update documentation if needed

3. **Commit your changes:**
   ```bash
   git add .
   git commit -m "Add feature: brief description"
   ```

   Use clear, descriptive commit messages:
   - `Add feature: XYZ`
   - `Fix bug: ABC not working on device XYZ`
   - `Improve: Better error messages for image validation`
   - `Docs: Update API documentation for cmdUpload`

4. **Push to your fork:**
   ```bash
   git push origin feature/your-feature-name
   ```

5. **Create a Pull Request:**
   - Go to the original repository on GitHub
   - Click "New Pull Request"
   - Select your feature branch
   - Fill out the PR template with:
     - **Description:** What does this PR do?
     - **Testing:** How did you test it? Which devices/browsers?
     - **Screenshots:** If UI changes, include before/after screenshots
     - **Breaking Changes:** Any API changes that could break existing code?

### Pull Request Checklist

Before submitting, ensure:
- [ ] Code follows project style guidelines
- [ ] All existing features still work (see [Testing](#testing))
- [ ] New features are documented in API.md (if applicable)
- [ ] README.md is updated if needed
- [ ] Commit messages are clear and descriptive
- [ ] No commented-out code or debug console.logs (unless intentional)
- [ ] Browser compatibility is maintained

### Review Process

- Maintainers will review your PR and may request changes
- Address feedback by pushing new commits to the same branch
- Once approved, your PR will be merged

## Adding New Features

### Adding New SMP Commands

To add support for a new SMP command:

1. **Add constants** in `js/mcumgr.js`:
   ```javascript
   // If new group, add group ID
   const MGMT_GROUP_ID_NEWGROUP = 10;

   // Add command ID
   const NEWGROUP_MGMT_ID_COMMAND = 0;
   ```

2. **Implement command method**:
   ```javascript
   cmdNewCommand(param1, param2) {
       const data = { param1, param2 };
       return this._sendMessage(
           MGMT_OP_WRITE,
           MGMT_GROUP_ID_NEWGROUP,
           NEWGROUP_MGMT_ID_COMMAND,
           data
       );
   }
   ```

3. **Update documentation**:
   - Add method to API.md
   - Add protocol details to PROTOCOL.md
   - Update examples if needed

4. **Test**:
   - Test on real hardware
   - Verify response handling in `onMessage` callback
   - Check error cases

### Adding UI Features

1. **Update HTML** (`index.html`):
   - Add new controls/buttons
   - Use Bootstrap classes for consistency
   - Add event listeners

2. **Update JavaScript** (`js/index.js`):
   - Add event handler functions
   - Update UI state management
   - Call MCUManager methods

3. **Update CSS** (`css/mcumgr.css`) if needed:
   - Keep styles minimal
   - Use Bootstrap utilities where possible

4. **Test**:
   - Test on different screen sizes
   - Test keyboard navigation
   - Test on different browsers

### Improving Documentation

Documentation improvements are always welcome:
- Fix typos or unclear explanations
- Add more examples
- Improve formatting
- Add diagrams or illustrations
- Translate to other languages

## Reporting Bugs

### Before Reporting

1. **Search existing issues** to avoid duplicates
2. **Try the latest version** from the main branch
3. **Test on multiple browsers** if possible
4. **Collect diagnostic information**:
   - Browser version
   - Operating system
   - Device type (if applicable)
   - Console errors (open Developer Tools → Console)
   - Bluetooth logs (from `chrome://bluetooth-internals/`)

### Bug Report Template

When creating an issue, include:

**Title:** Brief description of the bug

**Description:**
- What did you expect to happen?
- What actually happened?

**Steps to Reproduce:**
1. Connect to device...
2. Click upload...
3. See error...

**Environment:**
- Browser: Chrome 120.0.6099.109
- OS: Windows 11
- Device: nRF52840 DK with Mynewt OS 1.10.0

**Console Errors:**
```
Paste console errors here
```

**Additional Context:**
- Screenshots
- Bluetooth logs
- Any other relevant information

## Feature Requests

We welcome feature requests! When suggesting a new feature:

1. **Check existing issues** to see if it's already been requested
2. **Describe the use case** - why is this feature needed?
3. **Propose a solution** if you have ideas on how to implement it
4. **Consider contributing** - you're welcome to implement the feature yourself!

## Code of Conduct

### Our Standards

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on what's best for the project and community
- Accept constructive criticism gracefully
- Show empathy towards other community members

### Unacceptable Behavior

- Harassment, discrimination, or exclusionary behavior
- Trolling, insulting comments, or personal attacks
- Publishing others' private information
- Other conduct which could reasonably be considered inappropriate

## Testing on Different Devices

### Device-Specific Issues

Different devices may have quirks. Please report and document:

**Known Issues:**
- **NRF52.4:** Some devices return `rc: undefined` instead of `rc: 0` for success (workaround implemented)
- **Flash erase timeout:** Some devices need 500ms+ for erase operations (workaround implemented)

When adding workarounds:
- Comment the code explaining the device-specific behavior
- Document in API.md or PROTOCOL.md
- Consider making it configurable if it affects performance

### Testing Matrix

Help us test on various combinations:

| Device | OS | Browser | Status |
|--------|----|---------| -------|
| nRF52832 | Mynewt 1.9 | Chrome (desktop) | ✅ Works |
| nRF52840 | Zephyr 3.4 | Chrome (Android) | ❓ Untested |
| ESP32 | Zephyr 3.4 | Edge (desktop) | ❓ Untested |

## License

By contributing to MCU Manager Web, you agree that your contributions will be licensed under the same license as the project (check LICENSE file).

## Questions?

If you have questions about contributing:

1. Check the documentation (README.md, API.md, PROTOCOL.md)
2. Search existing issues and discussions
3. Create a new issue with your question
4. Tag it with "question" label

## Thank You!

Your contributions make this project better for everyone. Whether it's code, documentation, bug reports, or testing - every contribution is valuable and appreciated!
