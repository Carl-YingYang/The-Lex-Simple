// src/services/AiEngine.ts
import Constants from 'expo-constants';

// 🚨 TEMPORARY FIX: I-hardcode muna natin ang Ngrok URL para sigurado.
const BASE_URL = 'https://presuppurative-unconceitedly-peyton.ngrok-free.dev';

console.log(`[AI Engine] Using Base URL: ${BASE_URL}`);

export async function postEndpoint(endpoint: string, body: any) {
    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`[AI Engine] Error fetching ${endpoint}:`, error);
        throw error;
    }
}

export async function getEndpoint(endpoint: string) {
    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            method: 'GET',
            headers: {
                'ngrok-skip-browser-warning': 'true'
            }
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`[AI Engine] Error fetching ${endpoint}:`, error);
        throw error;
    }
}

// 🆕 PARA SA MGA FILE UPLOADS (PDF, DOCX, ETC)
export async function postFileEndpoint(endpoint: string, formData: FormData) {
    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'multipart/form-data',
                'ngrok-skip-browser-warning': 'true'
            },
            body: formData
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`[AI Engine] Error fetching ${endpoint}:`, error);
        throw error;
    }
}