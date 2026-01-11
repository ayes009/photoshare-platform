
const { BlobServiceClient } = require("@azure/storage-blob");

const STORAGE_ACCOUNT = "photoshare123";
const CONTAINER_NAME = "photos";
const METADATA_CONTAINER = "metadata";
const SAS_TOKEN = "sv=2024-11-04&ss=b&srt=co&sp=rwdlactfx&se=2028-11-11T11:32:46Z&st=2026-01-11T03:17:46Z&spr=https&sig=XvR24bM1qrCo%2Fy%2F7J53h6K4y92qwpUJjrSlsMLfJjrI%3D";
const BLOB_SERVICE_URL = `https://${STORAGE_ACCOUNT}.blob.core.windows.net`;

module.exports = async function (context, req) {
    try {
        const photoId = req.params.photoId;

        // Connect to Blob Storage
        const blobServiceClient = new BlobServiceClient(
            `${BLOB_SERVICE_URL}?${SAS_TOKEN}`
        );

        // Get metadata to find blob name
        const metadataContainer = blobServiceClient.getContainerClient(METADATA_CONTAINER);
        const metadataBlobClient = metadataContainer.getBlobClient(`${photoId}.json`);

        // Check if photo exists
        const exists = await metadataBlobClient.exists();
        if (!exists) {
            context.res = {
                status: 404,
                body: { error: 'Photo not found' }
            };
            return;
        }

        // Get photo metadata to find image blob name
        const downloadResponse = await metadataBlobClient.download();
        const photoData = await streamToString(downloadResponse.readableStreamBody);
        const photo = JSON.parse(photoData);

        // Extract blob name from URL
        const urlParts = photo.url.split('/');
        const blobNameWithParams = urlParts[urlParts.length - 1];
        const blobName = blobNameWithParams.split('?')[0];

        // Delete the image blob
        const photoContainer = blobServiceClient.getContainerClient(CONTAINER_NAME);
        const imageBlobClient = photoContainer.getBlobClient(blobName);
        await imageBlobClient.delete();

        // Delete metadata
        await metadataBlobClient.delete();

        context.res = {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: { message: 'Photo deleted successfully', photoId }
        };
    } catch (error) {
        context.log.error('Error deleting photo:', error);
        context.res = {
            status: 500,
            body: { error: 'Failed to delete photo', details: error.message }
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
