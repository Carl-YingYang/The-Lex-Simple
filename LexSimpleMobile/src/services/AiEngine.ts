const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

console.log(`[AI Engine] Using Base URL: ${BASE_URL}`);

export async function postFileEndpoint(endpoint: string, formData: FormData, signal?: AbortSignal) {
    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'ngrok-skip-browser-warning': 'true'
            },
            body: formData,
            signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Server Response Error:", errorText);
            throw new Error(`Server Error: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error: any) {
        if (error.name === 'AbortError') throw error; // Re-throw abort errors
        console.error(`[AI Engine] Error fetching ${endpoint}:`, error);
        throw error;
    }
}

// 🚀 NEW: BATCH UPLOAD ENDPOINT
export async function postBatchFileEndpoint(endpoint: string, formData: FormData) {
    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'ngrok-skip-browser-warning': 'true'
            },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Server Response Error:", errorText);
            throw new Error(`Server Error: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`[AI Engine] Error fetching ${endpoint}:`, error);
        throw error;
    }
}

export async function postEndpoint(endpoint: string, body: any, signal?: AbortSignal) {
    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify(body),
            signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Server Response Error:", errorText);
            throw new Error(`Server Error: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error: any) {
        if (error.name === 'AbortError') throw error;
        console.error(`[AI Engine] Error fetching ${endpoint}:`, error);
        throw error;
    }
}

export async function getEndpoint(endpoint: string, signal?: AbortSignal) {
    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            method: 'GET',
            headers: { 'ngrok-skip-browser-warning': 'true' },
            signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Server Response Error:", errorText);
            throw new Error(`Server Error: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error: any) {
        if (error.name === 'AbortError') throw error;
        console.error(`[AI Engine] Error fetching ${endpoint}:`, error);
        throw error;
    }
}