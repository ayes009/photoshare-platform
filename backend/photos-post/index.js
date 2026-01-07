// ============================================
// FILE: photos-post/index.js
// ============================================
const { BlobServiceClient } = require("@azure/storage-blob");

const STORAGE_ACCOUNT = "photosharestorage";
const CONTAINER_NAME = "photos";
const METADATA_CONTAINER = "metadata";
const SAS_TOKEN = "sv=2024-11-04&ss=b&srt=co&sp=rwdctfx&se=2026-01-07T04:01:36Z&st=2026-01-06T19:46:36Z&spr=https&sig=JzbWbKVLzdBwWMmaZ6KeG2qRLRJui%2Ft8U1On3VPbqKU%3D";
const BLOB_SERVICE_URL = `https://${STORAGE_ACCOUNT}.blob.core.windows.net`;

module.exports = async function (context, req) {
    try {
        const { title, caption, location, tags, imageData, fileName } = req.body;

        if (!title || !imageData || !fileName) {
            context.res = {
                status: 400,
                body: { error: 'Title, imageData, and fileName required' }
            };
            return;
        }

        // Get user info from auth header (simplified)
        const authHeader = req.headers.authorization || '';
        const username = authHeader ? Buffer.from(authHeader.replace('Bearer ', ''), 'base64').toString().split(':')[0] : 'Anonymous';

        const photoId = Date.now().toString();
        const blobName = `${photoId}-${fileName}`;

        // Connect to Blob Storage
        const blobServiceClient = new BlobServiceClient(
            `${BLOB_SERVICE_URL}?${SAS_TOKEN}`
        );

        // Upload image to photos container
        const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        // Convert base64 to buffer
        const base64Data = imageData.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');

        // Upload the image
        await blockBlobClient.upload(buffer, buffer.length, {
            blobHTTPHeaders: { blobContentType: 'image/jpeg' }
        });

        const imageUrl = `${BLOB_SERVICE_URL}/${CONTAINER_NAME}/${blobName}?${SAS_TOKEN}`;

        // Create photo metadata
        const photo = {
            id: photoId,
            title,
            caption: caption || '',
            location: location || '',
            tags: tags || '',
            url: imageUrl,
            creatorName: username,
            likes: 0,
            comments: [],
            rating: 0,
            ratingCount: 0,
            uploadedAt: new Date().toISOString()
        };

        // Save metadata to metadata container
        const metadataContainer = blobServiceClient.getContainerClient(METADATA_CONTAINER);
        const metadataBlobClient = metadataContainer.getBlockBlobClient(`${photoId}.json`);
        await metadataBlobClient.upload(
            JSON.stringify(photo),
            JSON.stringify(photo).length,
            { blobHTTPHeaders: { blobContentType: 'application/json' } }
        );

        context.res = {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
            body: photo
        };
    } catch (error) {
        context.log.error('Error uploading photo:', error);
        context.res = {
            status: 500,
            body: { error: 'Failed to upload photo', details: error.message }
        };
    }
};
