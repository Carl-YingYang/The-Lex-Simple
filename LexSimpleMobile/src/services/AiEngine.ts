const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

console.log(`[AI Engine] Using Base URL: ${BASE_URL}`);

// Helper function para may timeout ang fetch (Para hindi mag-hang ang Android)
const fetchWithTimeout = (url: any, options: any, timeout = 60000) => {
    return Promise.race([
        fetch(url, options),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Nag-timeout ang server. Masyadong malaki o mabagal ang file.')), timeout)
        )
    ]);
};

export async function postFileEndpoint(endpoint: string, formData: FormData) {
    try {
        const response: any = await fetchWithTimeout(`${BASE_URL}${endpoint}`, {
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

export async function postEndpoint(endpoint: string, body: any) {
    try {
        const response: any = await fetchWithTimeout(`${BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify(body)
        }, 30000); // 30s timeout for normal text

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
        const response: any = await fetchWithTimeout(`${BASE_URL}${endpoint}`, {
            method: 'GET',
            headers: {
                'ngrok-skip-browser-warning': 'true'
            }
        }, 30000);

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