import type {
    SanitizedDocumentApiPayload,
} from '../utils/sanitizer';


const DEFAULT_BASE_URL = 'http://localhost:8000';
const DEFAULT_TIMEOUT_MS = 90_000;
const ANALYSIS_TIMEOUT_MS = 5 * 60_000;

const normalizeBaseUrl = (value: string): string => {
    const normalized = value.trim().replace(/\/+$/, '');

    if (!/^https?:\/\//i.test(normalized)) {
        throw new Error(
            'EXPO_PUBLIC_API_URL must start with http:// or https://.'
        );
    }

    return normalized;
};

const BASE_URL = normalizeBaseUrl(
    process.env.EXPO_PUBLIC_API_URL || DEFAULT_BASE_URL
);

if (
    !process.env.EXPO_PUBLIC_API_URL &&
    typeof __DEV__ !== 'undefined' &&
    __DEV__
) {
    console.warn(
        '[AI Engine] EXPO_PUBLIC_API_URL is missing. ' +
            'localhost only works when the API is reachable from the same device/emulator.'
    );
}

console.log(`[AI Engine] API host: ${BASE_URL}`);


export type ApiErrorDetail = {
    code?: string;
    message?: string;
    documentStatus?: string;
    pageNumber?: number;
    [key: string]: unknown;
};

export class ApiError extends Error {
    readonly status: number;
    readonly code?: string;
    readonly detail?: ApiErrorDetail | string;

    constructor(
        message: string,
        options: {
            status?: number;
            code?: string;
            detail?: ApiErrorDetail | string;
        } = {}
    ) {
        super(message);
        this.name = 'ApiError';
        this.status = options.status ?? 0;
        this.code = options.code;
        this.detail = options.detail;

        Object.setPrototypeOf(this, ApiError.prototype);
    }
}

export type AnalysisFinding = {
    title: string;
    description: string;
    advice: string;
    foundText: string;
    confidence: string;
    scoreDeduction?: number;
    source?: 'llm' | 'rule_engine' | string;
    sourceChunk?: number;
};

export type AnalysisProcessingMeta = {
    chunkCount: number;
    pageCount: number;
    processedCharacters: number;
    documentHash: string;
};

export type AnalysisData = {
    score: number | null;
    riskLevel: string;
    documentTitle: string;
    documentStatus:
        | 'analyzed'
        | 'analyzed_no_flags'
        | 'unreadable'
        | 'not_legal_document'
        | 'processing_error'
        | string;
    analysisMode?: 'llm' | 'hybrid' | string;
    findings: AnalysisFinding[];
    processingMeta: AnalysisProcessingMeta;
    scoreAdjusted?: boolean;
    rag_context_used?: string;
};

export type SimplifyInputMeta = {
    documentId?: string | null;
    inputMode: 'sanitized_pages' | 'legacy_text' | string;
    pageCount: number;
    receivedCharacters: number;
    documentHash: string;
    pages?: Array<{
        pageNumber: number;
        characters: number;
        textHash: string;
    }>;
};

export type SimplifyResponse = {
    status: 'success';
    data: AnalysisData;
    inputMeta: SimplifyInputMeta;
    sanitizedText?: string;
};

type AbortContext = {
    signal: AbortSignal;
    cleanup: () => void;
    didTimeout: () => boolean;
};

const createAbortContext = (
    externalSignal?: AbortSignal,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
): AbortContext => {
    const controller = new AbortController();
    let timedOut = false;

    const handleExternalAbort = (): void => {
        controller.abort();
    };

    if (externalSignal?.aborted) {
        controller.abort();
    } else {
        externalSignal?.addEventListener(
            'abort',
            handleExternalAbort,
            { once: true }
        );
    }

    const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);

    return {
        signal: controller.signal,
        cleanup: () => {
            clearTimeout(timeoutId);
            externalSignal?.removeEventListener(
                'abort',
                handleExternalAbort
            );
        },
        didTimeout: () => timedOut,
    };
};

const normalizeEndpoint = (endpoint: string): string => {
    const trimmed = endpoint.trim();

    if (!trimmed) {
        throw new ApiError('Walang API endpoint na ibinigay.', {
            code: 'missing_endpoint',
        });
    }

    return trimmed.startsWith('/')
        ? trimmed
        : `/${trimmed}`;
};

const extractErrorInformation = (
    responseBody: unknown,
    fallbackMessage: string
): {
    message: string;
    code?: string;
    detail?: ApiErrorDetail | string;
} => {
    if (
        responseBody &&
        typeof responseBody === 'object'
    ) {
        const body = responseBody as Record<string, unknown>;
        const rawDetail = body.detail;

        if (
            rawDetail &&
            typeof rawDetail === 'object'
        ) {
            const detail = rawDetail as ApiErrorDetail;
            return {
                message:
                    typeof detail.message === 'string'
                        ? detail.message
                        : fallbackMessage,
                code:
                    typeof detail.code === 'string'
                        ? detail.code
                        : undefined,
                detail,
            };
        }

        if (typeof rawDetail === 'string') {
            return {
                message: rawDetail,
                detail: rawDetail,
            };
        }

        return {
            message:
                typeof body.message === 'string'
                    ? body.message
                    : fallbackMessage,
            code:
                typeof body.code === 'string'
                    ? body.code
                    : undefined,
            detail: body as ApiErrorDetail,
        };
    }

    if (
        typeof responseBody === 'string' &&
        responseBody.trim()
    ) {
        return {
            message: responseBody.trim(),
            detail: responseBody.trim(),
        };
    }

    return { message: fallbackMessage };
};

const readResponseBody = async (
    response: Response
): Promise<unknown> => {
    const rawText = await response.text();

    if (!rawText.trim()) {
        return null;
    }

    try {
        return JSON.parse(rawText);
    } catch {
        return rawText;
    }
};

const request = async <TResponse>(
    endpoint: string,
    options: RequestInit,
    externalSignal?: AbortSignal,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<TResponse> => {
    const normalizedEndpoint = normalizeEndpoint(endpoint);
    const abortContext = createAbortContext(
        externalSignal,
        timeoutMs
    );

    try {
        const response = await fetch(
            `${BASE_URL}${normalizedEndpoint}`,
            {
                ...options,
                headers: {
                    Accept: 'application/json',
                    'ngrok-skip-browser-warning': 'true',
                    ...(options.headers ?? {}),
                },
                signal: abortContext.signal,
            }
        );

        const responseBody = await readResponseBody(response);

        if (!response.ok) {
            const errorInfo = extractErrorInformation(
                responseBody,
                `Server error (${response.status}).`
            );

            console.error(
                `[AI Engine] ${normalizedEndpoint} failed:`,
                {
                    status: response.status,
                    code: errorInfo.code,
                }
            );

            throw new ApiError(errorInfo.message, {
                status: response.status,
                code: errorInfo.code,
                detail: errorInfo.detail,
            });
        }

        if (responseBody === null) {
            throw new ApiError(
                'Walang response na ibinalik ang server.',
                {
                    status: response.status,
                    code: 'empty_server_response',
                }
            );
        }

        return responseBody as TResponse;
    } catch (error: unknown) {
        if (abortContext.didTimeout()) {
            throw new ApiError(
                'Masyadong matagal ang server response. Subukan ulit kapag mas stable ang internet.',
                {
                    status: 408,
                    code: 'request_timeout',
                }
            );
        }

        if (
            externalSignal?.aborted ||
            (
                error instanceof Error &&
                error.name === 'AbortError'
            )
        ) {
            throw error;
        }

        if (error instanceof ApiError) {
            throw error;
        }

        console.error(
            `[AI Engine] Network failure at ${normalizedEndpoint}.`
        );

        throw new ApiError(
            'Hindi makakonekta sa Lex-Simple server. I-check ang internet at API URL.',
            {
                status: 0,
                code: 'network_error',
            }
        );
    } finally {
        abortContext.cleanup();
    }
};


export async function postEndpoint<
    TResponse = any,
    TBody = unknown,
>(
    endpoint: string,
    body: TBody,
    signal?: AbortSignal
): Promise<TResponse> {
    return request<TResponse>(
        endpoint,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        },
        signal
    );
}

export async function postFileEndpoint<
    TResponse = any,
>(
    endpoint: string,
    formData: FormData,
    signal?: AbortSignal
): Promise<TResponse> {
    return request<TResponse>(
        endpoint,
        {
            method: 'POST',
            // Do not manually set Content-Type. fetch must create the
            // multipart boundary for FormData.
            body: formData,
        },
        signal
    );
}

/**
 * Deliberately disabled: raw scan images must never be uploaded by the
 * privacy-safe batch editing flow.
 */
export async function postBatchFileEndpoint(
    _endpoint?: string,
    _formData?: FormData,
    _signal?: AbortSignal
): Promise<never> {
    throw new ApiError(
        'Hindi na pinapayagan ang raw-image batch upload. I-update ang BatchEditScreen para gumamit ng sanitized OCR pages.',
        {
            status: 410,
            code: 'raw_image_batch_disabled',
        }
    );
}

export async function getEndpoint<TResponse = any>(
    endpoint: string,
    signal?: AbortSignal
): Promise<TResponse> {
    return request<TResponse>(
        endpoint,
        { method: 'GET' },
        signal
    );
}

const validateSanitizedPayload = (
    payload: SanitizedDocumentApiPayload
): void => {
    if (!payload.documentId?.trim()) {
        throw new ApiError(
            'Walang document ID ang sanitized OCR payload.',
            { code: 'missing_document_id' }
        );
    }

    if (
        !Array.isArray(payload.pages) ||
        payload.pages.length === 0 ||
        payload.pageCount !== payload.pages.length
    ) {
        throw new ApiError(
            'Hindi tugma ang page count ng sanitized OCR payload.',
            { code: 'invalid_page_count' }
        );
    }

    payload.pages.forEach((page, index) => {
        const expectedPageNumber = index + 1;

        if (page.pageNumber !== expectedPageNumber) {
            throw new ApiError(
                `Mali ang order ng sanitized Page ${expectedPageNumber}.`,
                { code: 'invalid_page_order' }
            );
        }

        if (
            typeof page.sanitizedText !== 'string' ||
            page.sanitizedText.trim().length < 20
        ) {
            throw new ApiError(
                `Hindi sapat ang sanitized text ng Page ${expectedPageNumber}.`,
                { code: 'insufficient_page_text' }
            );
        }

        if (!/^[a-f0-9]{64}$/i.test(page.textHash)) {
            throw new ApiError(
                `Invalid ang text hash ng Page ${expectedPageNumber}.`,
                { code: 'invalid_page_hash' }
            );
        }
    });
};

const verifyAnalysisIntegrity = (
    payload: SanitizedDocumentApiPayload,
    response: SimplifyResponse
): void => {
    if (
        !response ||
        response.status !== 'success' ||
        !response.data ||
        !response.inputMeta
    ) {
        throw new ApiError(
            'Hindi kumpleto ang analysis response ng server.',
            { code: 'invalid_analysis_response' }
        );
    }

    if (
        response.inputMeta.inputMode !== 'sanitized_pages' ||
        response.inputMeta.pageCount !== payload.pageCount
    ) {
        throw new ApiError(
            'Hindi tugma ang bilang ng pages na natanggap ng server.',
            { code: 'response_page_count_mismatch' }
        );
    }

    if (
        response.data.processingMeta?.pageCount !==
        payload.pageCount
    ) {
        throw new ApiError(
            'Hindi lahat ng pages ay naisama sa AI processing.',
            { code: 'processed_page_count_mismatch' }
        );
    }

    const serverPages = response.inputMeta.pages;
    if (
        !Array.isArray(serverPages) ||
        serverPages.length !== payload.pages.length
    ) {
        throw new ApiError(
            'Kulang ang page verification data mula sa server.',
            { code: 'missing_page_verification' }
        );
    }

    payload.pages.forEach((page, index) => {
        const serverPage = serverPages[index];

        if (
            serverPage.pageNumber !== page.pageNumber ||
            serverPage.textHash.toLocaleLowerCase() !==
                page.textHash.toLocaleLowerCase()
        ) {
            throw new ApiError(
                `Nagbago o hindi tugma ang sanitized Page ${page.pageNumber} bago ito na-process.`,
                { code: 'response_page_hash_mismatch' }
            );
        }
    });
};

/**
 * The only supported batch scan analysis call.
 *
 * The payload contains sanitized text and hashes only. It never contains raw
 * images, image URIs, or unsanitized OCR text.
 */
export async function analyzeSanitizedDocument(
    payload: SanitizedDocumentApiPayload,
    signal?: AbortSignal
): Promise<SimplifyResponse> {
    validateSanitizedPayload(payload);

    const response = await request<SimplifyResponse>(
        '/simplify',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        },
        signal,
        ANALYSIS_TIMEOUT_MS
    );

    verifyAnalysisIntegrity(payload, response);
    return response;
}
