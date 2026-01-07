// ============================================
// FILE: function.json (for each function)
// ============================================

// auth-login/function.json
{
  "bindings": [
    {
      "authLevel": "anonymous",
      "type": "httpTrigger",
      "direction": "in",
      "name": "req",
      "methods": ["post"],
      "route": "auth/login"
    },
    {
      "type": "http",
      "direction": "out",
      "name": "res"
    }
  ]
}

// ============================================
// FILE: auth-login/index.js
// ============================================
module.exports = async function (context, req) {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
        context.res = {
            status: 400,
            body: { error: 'Username, password, and role required' }
        };
        return;
    }

    // In production, verify credentials against database
    // For now, accept any credentials
    const user = {
        id: Date.now().toString(),
        username,
        role,
        token: Buffer.from(`${username}:${Date.now()}`).toString('base64')
    };

    context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { user }
    };
};

// ============================================
// FILE: photos-get/function.json
// ============================================
{
  "bindings": [
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

// ============================================
// FILE: photos-post/function.json
// ============================================
{
  "bindings": [
    {
      "authLevel": "anonymous",
      "type": "httpTrigger",
      "direction": "in",
      "name": "req",
      "methods": ["post"],
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

// ============================================
// FILE: photos-delete/function.json
// ============================================
{
  "bindings": [
    {
      "authLevel": "anonymous",
      "type": "httpTrigger",
      "direction": "in",
      "name": "req",
      "methods": ["delete"],
      "route": "photos/{photoId}"
    },
    {
      "type": "http",
      "direction": "out",
      "name": "res"
    }
  ]
}

// ============================================
// FILE: photos-delete/index.js
// ============================================
const { BlobServiceClient } = require("@azure/storage-blob");

const STORAGE_ACCOUNT = "photosharestorage";
const CONTAINER_NAME = "photos";
const METADATA_CONTAINER = "metadata";
const SAS_TOKEN = "sv=2024-11-04&ss=b&srt=co&sp=rwdctfx&se=2026-01-07T04:01:36Z&st=2026-01-06T19:46:36Z&spr=https&sig=JzbWbKVLzdBwWMmaZ6KeG2qRLRJui%2Ft8U1On3VPbqKU%3D";
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

// ============================================
// FILE: photos-like/function.json
// ============================================
{
  "bindings": [
    {
      "authLevel": "anonymous",
      "type": "httpTrigger",
      "direction": "in",
      "name": "req",
      "methods": ["post"],
      "route": "photos/{photoId}/like"
    },
    {
      "type": "http",
      "direction": "out",
      "name": "res"
    }
  ]
}

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

// ============================================
// FILE: photos-rate/function.json
// ============================================
{
  "bindings": [
    {
      "authLevel": "anonymous",
      "type": "httpTrigger",
      "direction": "in",
      "name": "req",
      "methods": ["post"],
      "route": "photos/{photoId}/rate"
    },
    {
      "type": "http",
      "direction": "out",
      "name": "res"
    }
  ]
}

// ============================================
// FILE: photos-rate/index.js
// ============================================
const { BlobServiceClient } = require("@azure/storage-blob");

const STORAGE_ACCOUNT = "photosharestorage";
const METADATA_CONTAINER = "metadata";
const SAS_TOKEN = "sv=2024-11-04&ss=b&srt=co&sp=rwdctfx&se=2026-01-07T04:01:36Z&st=2026-01-06T19:46:36Z&spr=https&sig=JzbWbKVLzdBwWMmaZ6KeG2qRLRJui%2Ft8U1On3VPbqKU%3D";
const BLOB_SERVICE_URL = `https://${STORAGE_ACCOUNT}.blob.core.windows.net`;

module.exports = async function (context, req) {
    try {
        const photoId = req.params.photoId;
        const { rating } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            context.res = {
                status: 400,
                body: { error: 'Rating must be between 1 and 5' }
            };
            return;
        }

        const blobServiceClient = new BlobServiceClient(
            `${BLOB_SERVICE_URL}?${SAS_TOKEN}`
        );

        const metadataContainer = blobServiceClient.getContainerClient(METADATA_CONTAINER);
        const metadataBlobClient = metadataContainer.getBlobClient(`${photoId}.json`);

        // Get current metadata
        const downloadResponse = await metadataBlobClient.download();
        const photoData = await streamToString(downloadResponse.readableStreamBody);
        const photo = JSON.parse(photoData);

        // Calculate new rating
        const newRatingCount = photo.ratingCount + 1;
        photo.rating = ((photo.rating * photo.ratingCount) + rating) / newRatingCount;
        photo.ratingCount = newRatingCount;

        // Update metadata
        await metadataBlobClient.upload(
            JSON.stringify(photo),
            JSON.stringify(photo).length,
            { blobHTTPHeaders: { blobContentType: 'application/json' } }
        );

        context.res = {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: { success: true, rating: photo.rating, ratingCount: photo.ratingCount }
        };
    } catch (error) {
        context.log.error('Error rating photo:', error);
        context.res = {
            status: 500,
            body: { error: 'Failed to rate photo', details: error.message }
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

// ============================================
// FILE: package.json
// ============================================
{
  "name": "photoshare-functions",
  "version": "1.0.0",
  "description": "PhotoShare Azure Functions Backend",
  "main": "index.js",
  "scripts": {
    "start": "func start",
    "test": "echo \"No tests yet\""
  },
  "dependencies": {
    "@azure/storage-blob": "^12.17.0"
  },
  "devDependencies": {}
}

// ============================================
// FILE: host.json
// ============================================
{
  "version": "2.0",
  "logging": {
    "applicationInsights": {
      "samplingSettings": {
        "isEnabled": true,
        "maxTelemetryItemsPerSecond": 20
      }
    }
  },
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[3.*, 4.0.0)"
  },
  "extensions": {
    "http": {
      "routePrefix": "api"
    }
  }
}

// ============================================
// FILE: local.settings.json
// ============================================
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "STORAGE_ACCOUNT": "photosharestorage",
    "SAS_TOKEN": "sv=2024-11-04&ss=b&srt=co&sp=rwdctfx&se=2026-01-07T04:01:36Z&st=2026-01-06T19:46:36Z&spr=https&sig=JzbWbKVLzdBwWMmaZ6KeG2qRLRJui%2Ft8U1On3VPbqKU%3D"
  }
}
