// 🚀 BASAHIN ANG URL MULA SA .env FILE
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

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

export async function getEndpoint(endpoint: string) {
    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            method: 'GET',
            headers: {
                'ngrok-skip-browser-warning': 'true'
            }
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

// 🆕 PARA SA MGA FILE UPLOADS (PDF, DOCX, ETC)
export async function postFileEndpoint(endpoint: string, formData: FormData) {
    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'ngrok-skip-browser-warning': 'true'
                // Wag lagyan ng Content-Type, RN handles it
            },
            body: formData
        });

        // 🚀 KUNG MAY ERROR ANG SERVER (HAL. 500 INTERNAL SERVER ERROR)
        if (!response.ok) {
            const errorText = await response.text();
            console.error("Server Response Error:", errorText);
            throw new Error(`Server Error: ${response.status} - ${errorText.substring(0, 100)}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`[AI Engine] Error fetching ${endpoint}:`, error);
        throw error;
    }
}