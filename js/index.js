const screens = {
    initial: document.getElementById('initial-screen'),
    connecting: document.getElementById('connecting-screen'),
    connected: document.getElementById('connected-screen')
};

const deviceName = document.getElementById('device-name');
const connectButton = document.getElementById('button-connect');
const echoButton = document.getElementById('button-echo');
const disconnectButton = document.getElementById('button-disconnect');
const resetButton = document.getElementById('button-reset');
const imageList = document.getElementById('image-list');

const device = new NewtManager();
device.onConnecting(() => {
    console.log('Connecting...');
    screens.connecting.style.display = 'block';
    screens.initial.style.display = 'none';
    screens.connected.style.display = 'none';
});
device.onConnect(() => {
    deviceName.innerText = device.deviceName;
    screens.connecting.style.display = 'none';
    screens.initial.style.display = 'none';
    screens.connected.style.display = 'block';
});
device.onDisconnect(() => {
    deviceName.innerText = 'Connect your device';
    screens.connecting.style.display = 'none';
    screens.initial.style.display = 'block';
    screens.connected.style.display = 'none';
});
device.onMessage(message => {
});

connectButton.addEventListener('click', async () => {
    await device.connect();
});

disconnectButton.addEventListener('click', async () => {
    device.disconnect();
});

echoButton.addEventListener('click', async () => {
    const message = prompt('Enter a text message to send', 'Hello World!');
    await device.smpEcho(message);
});

resetButton.addEventListener('click', async () => {
    await device.smpReset();
});
