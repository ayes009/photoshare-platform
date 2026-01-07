// ============================================
// FILE: photos-get/function.json
// ============================================
{
  "bindings"[
    {
      "authLevel": "anonymous",
      "type": "httpTrigger",
      "direction": "in",
      "name": "req",
      "methods": ["get"],
      "route": "photos"
    },
    {
      "type": "http",
      "direction": "out",
      "name": "res"
    }
  ]
}

// ============================================
// FILE: photos-get/index.js
// ============================================
const { BlobServiceClient } = require("@azure/storage-blob");

// Azure Blob Storage Configuration
const STORAGE_ACCOUNT = "photosharestorage"; // Replace with your storage account name
const CONTAINER_NAME = "photos";
const SAS_TOKEN = "sv=2024-11-04&ss=b&srt=co&sp=rwdctfx&se=2026-01-07T04:01:36Z&st=2026-01-06T19:46:36Z&spr=https&sig=JzbWbKVLzdBwWMmaZ6KeG2qRLRJui%2Ft8U1On3VPbqKU%3D";
const BLOB_SERVICE_URL = `https://${STORAGE_ACCOUNT}.blob.core.windows.net`;

module.exports = async function (context, req) {
    try {
        // Connect to Blob Storage
        const blobServiceClient = new BlobServiceClient(
            `${BLOB_SERVICE_URL}?${SAS_TOKEN}`
        );
        const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

        // List all blobs (photos metadata stored as JSON)
        const photos = [];
        const metadataContainer = blobServiceClient.getContainerClient('metadata');
        
        for await (const blob of metadataContainer.listBlobsFlat()) {
            if (blob.name.endsWith('.json')) {
                const blobClient = metadataContainer.getBlobClient(blob.name);
                const downloadResponse = await blobClient.download();
                const photoData = await streamToString(downloadResponse.readableStreamBody);
                photos.push(JSON.parse(photoData));
            }
        }

        // Sort by upload date (newest first)
        photos.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

        context.res = {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: photos
        };
    } catch (error) {
        context.log.error('Error fetching photos:', error);
        context.res = {
            status: 500,
            body: { error: 'Failed to fetch photos', details: error.message }
        };
    }
};

// Helper function to convert stream to string
async function streamToString(readableStream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        readableStream.on('data', (data) => chunks.push(data.toString()));
        readableStream.on('end', () => resolve(chunks.join('')));
        readableStream.on('error', reject);
    });
}


