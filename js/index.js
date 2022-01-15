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
const imageStateButton = document.getElementById('button-image-state');
const eraseButton = document.getElementById('button-erase');
const imageList = document.getElementById('image-list');
const fileInfo = document.getElementById('file-info');
const fileStatus = document.getElementById('file-status');
const fileImage = document.getElementById('file-image');
const fileUpload = document.getElementById('file-upload');

const mcumgr = new MCUManager();
mcumgr.onConnecting(() => {
    console.log('Connecting...');
    screens.connecting.style.display = 'block';
    screens.initial.style.display = 'none';
    screens.connected.style.display = 'none';
});
mcumgr.onConnect(() => {
    deviceName.innerText = mcumgr.name;
    screens.connecting.style.display = 'none';
    screens.initial.style.display = 'none';
    screens.connected.style.display = 'block';
    imageList.innerHTML = '';
    mcumgr.cmdImageState();
});
mcumgr.onDisconnect(() => {
    deviceName.innerText = 'Connect your device';
    screens.connecting.style.display = 'none';
    screens.initial.style.display = 'block';
    screens.connected.style.display = 'none';
});

mcumgr.onMessage(({ op, group, id, data, length }) => {
    console.log({ op, group, id, data, length });
    switch (group) {
        case MGMT_GROUP_ID_OS:
            switch (id) {
                case OS_MGMT_ID_ECHO:
                    alert(data.r);
                    break;
                case OS_MGMT_ID_TASKSTAT:
                    console.table(data.tasks);
                    break;
                case OS_MGMT_ID_MPSTAT:
                    console.log(data);
                    break;
            }
            break;
        case MGMT_GROUP_ID_IMAGE:
            switch (id) {
                case IMG_MGMT_ID_STATE:
                    let images = '';
                    data.images.forEach(image => {
                        images += `<div class="image ${image.active ? 'active' : 'standby'}">`;
                        images += `<h2>Slot #${image.slot} ${image.active ? 'active' : 'standby'}</h2>`;
                        images += '<table>';
                        const hashStr = Array.from(image.hash).map(byte => byte.toString(16).padStart(2, '0')).join('');
                        images += `<tr><th>Version</th><td>v${image.version}</td></tr>`;
                        images += `<tr><th>Bootable</th><td>${image.bootable}</td></tr>`;
                        images += `<tr><th>Confirmed</th><td>${image.confirmed}</td></tr>`;
                        images += `<tr><th>Pending</th><td>${image.pending}</td></tr>`;
                        images += `<tr><th>Hash</th><td>${hashStr}</td></tr>`;
                        images += '</table>';
                        images += '</div>';
                    });
                    imageList.innerHTML = images;
                    break;
            }
            break;
        default:
            console.log('Unknown group');
            break;
    }
});

let file = null;
let fileData = null;
let sha256sum = null;

mcumgr.onImageUploadProgress(({ percentage }) => {
    fileStatus.innerText = `Uploading... ${percentage}%`;
});

mcumgr.onImageUploadFinished(() => {
    fileStatus.innerText = 'Upload complete';
    fileInfo.innerHTML = '';
    fileImage.value = '';
    mcumgr.cmdImageState();
});

fileImage.addEventListener('change', () => {
    file = fileImage.files[0];
    fileData = null;
    const reader = new FileReader();
    reader.onload = async () => {
        fileData = reader.result;
        try {
            const info = await mcumgr.imageInfo(fileData);
            let table = `<table>`
            table += `<tr><th>Version</th><td>v${info.version}</td></tr>`;
            table += `<tr><th>Hash</th><td>${info.hash}</td></tr>`;
            table += `<tr><th>File Size</th><td>${fileData.byteLength} bytes</td></tr>`;
            table += `<tr><th>Size</th><td>${info.imageSize} bytes</td></tr>`;
            table += `</table>`;

            fileInfo.innerHTML = table;
            fileUpload.disabled = false;
        } catch (e) {
            fileInfo.innerHTML = `ERROR: ${e.message}`;
        }
    };
    reader.readAsArrayBuffer(file);
});
fileUpload.addEventListener('click', event => {
    fileUpload.disabled = true;
    event.stopPropagation();
    if (file && fileData) {
        mcumgr.cmdUpload(fileData);
    }
});

connectButton.addEventListener('click', async () => {
    await mcumgr.connect();
});

disconnectButton.addEventListener('click', async () => {
    mcumgr.disconnect();
});

echoButton.addEventListener('click', async () => {
    const message = prompt('Enter a text message to send', 'Hello World!');
    await mcumgr.smpEcho(message);
});

resetButton.addEventListener('click', async () => {
    await mcumgr.cmdReset();
});

imageStateButton.addEventListener('click', async () => {
    await mcumgr.cmdImageState();
});

eraseButton.addEventListener('click', async () => {
    await mcumgr.cmdImageErase();
});
