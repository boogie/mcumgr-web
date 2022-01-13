# MCU Manager (Web Bluetooth)

This tool is the Web Bluetooth version of MCU Manager that enables a user to communicate with and manage remote devices running the Mynewt OS. It uses a connection profile to establish a connection with a device and sends command requests to the device.

The main focus is implementing firmware updates via Web Bluetooth, however other commands might be supported as well.

The Web Bluetooth API provides the ability to connect and interact with Bluetooth Low Energy peripherals. You’ll find Web Bluetooth in Chrome, Edge and Opera browsers on the desktop and Android. On iOS, browsers are using the Safari WebKit engine which not yet supports Web Bluetooth, however there are some apps in the App Store implementing a browser with Web Bluetooth.

You can try this code by visiting https://boogie.github.io/mcumgr-web/. For security reasons of Web Bluetooth, it is only working on https addresses or localhost.
