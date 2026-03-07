import axios from 'axios';

interface UploadResult {
  attachmentId: string;
}

export async function uploadImageToMeta(
  pageId: string,
  pageAccessToken: string,
  imageBuffer: Buffer,
  filename: string
): Promise<UploadResult> {
  try {
    const formData = new FormData();
    formData.append('message', JSON.stringify({
      attachment: {
        type: 'image',
        payload: {
          is_reusable: true,
        },
      },
    }));
    
    const uint8Array = new Uint8Array(imageBuffer);
    const blob = new Blob([uint8Array]);
    formData.append('filedata', blob, filename);

    const uploadRes = await axios.post(
      `https://graph.facebook.com/v19.0/${pageId}/message_attachments`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${pageAccessToken}`,
        },
      }
    );

    return {
      attachmentId: uploadRes.data.attachment_id,
    };
  } catch (error: any) {
    console.error('Meta attachment upload failed:', error.response?.data || error.message);
    throw new Error('Failed to upload image to Meta');
  }
}
