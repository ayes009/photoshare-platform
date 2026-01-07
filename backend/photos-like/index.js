// ============================================
// FILE: photos-like/index.js
// ============================================
const { BlobServiceClient } = require("@azure/storage-blob");

const STORAGE_ACCOUNT = "photosharestorage";
const METADATA_CONTAINER = "metadata";
const SAS_TOKEN = "sv=2024-11-04&ss=b&srt=co&sp=rwdctfx&se=2026-01-07T04:01:36Z&st=2026-01-06T19:46:36Z&spr=https&sig=JzbWbKVLzdBwWMmaZ6KeG2qRLRJui%2Ft8U1On3VPbqKU%3D";
const BLOB_SERVICE_URL = `https://${STORAGE_ACCOUNT}.blob.core.windows.net`;

module.exports = async function (context, req) {
    try {
        const photoId = req.params.photoId;

        const blobServiceClient = new BlobServiceClient(
            `${BLOB_SERVICE_URL}?${SAS_TOKEN}`
        );

        const metadataContainer = blobServiceClient.getContainerClient(METADATA_CONTAINER);
        const metadataBlobClient = metadataContainer.getBlobClient(`${photoId}.json`);

        // Get current metadata
        const downloadResponse = await metadataBlobClient.download();
        const photoData = await streamToString(downloadResponse.readableStreamBody);
        const photo = JSON.parse(photoData);

        // Increment likes
        photo.likes++;

        // Update metadata
        await metadataBlobClient.upload(
            JSON.stringify(photo),
            JSON.stringify(photo).length,
            { blobHTTPHeaders: { blobContentType: 'application/json' } }
        );

        context.res = {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: { success: true, likes: photo.likes }
        };
    } catch (error) {
        context.log.error('Error liking photo:', error);
        context.res = {
            status: 500,
            body: { error: 'Failed to like photo', details: error.message }
        };
    }
};

async function streamToString(readableStream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        readableStream.on('data', (data) => chunks.push(data.toString()));
        readableStream.on('end', () => resolve(chunks.join('')));
        readableStream.on('error', reject);
    });
}
