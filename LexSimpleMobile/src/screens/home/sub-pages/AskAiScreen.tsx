// ASK AI SCREEN VERSION: 9.0.0 — PURPLE NEO-BRUTALISM SPEC
// (Chat/AI/storage logic 1:1 pa rin; UI lang ang binago, PLUS tinanggal
// ang voice input ayon sa request ni user)
// Spec: purple system (zero na ang asul/dilaw/gold/orange), 1.5px standard
// borders, 2px lang sa CTA, 2–6px radius (squared), predominantly FLAT —
// walang shadow sa chat bubbles (list items); hard shadow lang sa CTA at
// modal (focal elements).
// Pagbabago sa UI (v9.0.0):
//   - TINANGGAL ang voice/mic input: mic button sa composer, mic modal,
//     speech recognition events/handlers/state, at SpeechRecognitionSafe
//     import — text input na lang ang paraan ng pag-compose.
//   - Binura ang PRIMARY/PRIMARY_SOFT/DANGER constants — tokens lahat
//     (T.brand / T.brandText / T.danger / T.overlay + BORDER/RADIUS).
//   - User bubble: purple fill + ITIM na teksto (spec CTA rule), 1.5px ink
//     border, 6px radius. Lexie bubble: card bg + 1.5px ink border.
//     Error bubble: dangerSoft bg + danger border.
//   - Send/delete buttons: 2px ink border + hard shadow (getNeoShadow
//     'sm'), ITIM na icon/teksto sa purple fill.
//   - Chips/inputs/modals: squared 4–6px, 1.5px ink outlines.
//   - Uppercase meta labels (regenerate, loading, status, note, buttons).
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import ScreenLayout from '../../../components/ScreenLayout';
import { useCustomAlert } from '../../../components/CustomAlert';
import { getNeoShadow } from '../../../components/Neo';
import { postEndpoint } from '../../../services/AiEngine';
import { useTheme } from '../../../theme/ThemeContext';
import { BORDER, RADIUS } from '../../../theme/tokens';
import { localDataKey } from '../../../services/localDataScope';
import { sanitizeLocalText } from '../../../utils/sanitizer';

interface Message {
    id: string;
    text: string;
    sender: 'user' | 'ai';
    isError?: boolean;
    attachedFileName?: string;
    hiddenData?: string;
    redactedNote?: boolean;
}

type AttachedFile = {
    name: string;
    data: string;
};

type SendOptions = {
    text?: string;
    hiddenData?: string;
    fileName?: string;
    mode?: 'new' | 'regenerate';
    displayHistory?: Message[];
    contextHistory?: Message[];
};

const DEFAULT_WELCOME_MESSAGE: Message = {
    id: 'lexie-welcome',
    sender: 'ai',
    text:
        'Hi, ako si Lexie, ang Legal Text Guide ng Lex-Simple. Tutulungan kitang unawain ang legal terms at document text sa mas simpleng paraan. Hindi ito legal advice o kapalit ng abogado.',
};

const DEFAULT_PROMPTS = [
    'Ipaliwanag ito sa simpleng Taglish.',
    'Ano ang mahahalagang bahagi nito?',
    'May kailangan ba akong bantayan?',
    'Buodin ang dokumento.',
];

let messageSequence = 0;

const createMessageId = (prefix: 'user' | 'lexie'): string => {
    messageSequence += 1;
    return `${prefix}-${Date.now()}-${messageSequence}`;
};

const getPersistableMessages = (messages: Message[]): Message[] =>
    messages.map(({ hiddenData: _hiddenData, ...message }) => message);

type MessageBubbleProps = {
    item: Message;
    isLastMessage: boolean;
    isLoading: boolean;
    onOptions: (message: Message) => void;
    onRegenerate: (messageId: string) => void;
    T: any;
};

const MessageBubble = ({
    item,
    isLastMessage,
    isLoading,
    onOptions,
    onRegenerate,
    T,
}: MessageBubbleProps) => {
    const isUser = item.sender === 'user';

    return (
        <View style={styles.messageBlock}>
            {isUser && item.redactedNote && (
                <Text
                    style={[
                        styles.redactedNoteText,
                        { color: T.subText },
                    ]}
                >
                    May personal na detalye sa mensahe mo na itinago bago
                    ipadala.
                </Text>
            )}
            <View
                style={[
                    styles.messageRow,
                    isUser && styles.userMessageRow,
                    !isUser && styles.lexieMessageRow,
                ]}
            >
                {!isUser && (
                    <View
                        style={[
                            styles.lexieAvatar,
                            {
                                backgroundColor: T.card,
                                borderColor: T.ink,
                            },
                        ]}
                    >
                        <Image
                            source={require('../../../../assets/icons/chat_ai.png')}
                            style={styles.lexieAvatarImage}
                            resizeMode="contain"
                        />
                    </View>
                )}

                <TouchableOpacity
                    activeOpacity={0.9}
                    onLongPress={
                        isUser && !isLoading
                            ? () => onOptions(item)
                            : undefined
                    }
                    delayLongPress={400}
                    disabled={!isUser || isLoading}
                    style={styles.bubblePressArea}
                >
                    <View
                        style={[
                            styles.bubble,
                            isUser
                                ? {
                                      backgroundColor: T.brand,
                                      borderColor: T.ink,
                                  }
                                : {
                                      backgroundColor: T.card,
                                      borderColor: T.ink,
                                  },
                            item.isError && {
                                borderColor: T.danger,
                                backgroundColor: T.dangerSoft,
                            },
                        ]}
                    >
                        {item.attachedFileName && (
                            <View
                                style={[
                                    styles.fileLabel,
                                    {
                                        backgroundColor: T.bg,
                                        borderColor: isUser
                                            ? T.ink
                                            : T.border,
                                    },
                                ]}
                            >
                                <Ionicons
                                    name="document-text-outline"
                                    size={14}
                                    color={T.text}
                                />
                                <Text
                                    style={[
                                        styles.fileLabelText,
                                        {
                                            color: T.text,
                                        },
                                    ]}
                                    numberOfLines={1}
                                >
                                    {item.attachedFileName}
                                </Text>
                            </View>
                        )}

                        <Text
                            style={[
                                styles.messageText,
                                {
                                    color: isUser
                                        ? T.brandText
                                        : T.text,
                                },
                            ]}
                            selectable
                        >
                            {item.text}
                        </Text>
                    </View>
                </TouchableOpacity>
            </View>

            {!isUser &&
                isLastMessage &&
                !item.isError &&
                item.id !== DEFAULT_WELCOME_MESSAGE.id &&
                !isLoading && (
                    <TouchableOpacity
                        style={styles.regenerateButton}
                        onPress={() => onRegenerate(item.id)}
                        accessibilityRole="button"
                    >
                        <Ionicons
                            name="refresh-outline"
                            size={15}
                            color={T.subText}
                        />
                        <Text
                            style={[
                                styles.regenerateText,
                                { color: T.subText },
                            ]}
                        >
                            SUBUKAN ULIT
                        </Text>
                    </TouchableOpacity>
                )}
        </View>
    );
};

export default function AskAiScreen({ route }: any) {
    // Captured per screen instance so a late response cannot write to another account.
    const chatHistoryKey = useRef(localDataKey('chatHistory')).current;
    const { colors: T } = useTheme();
    const { showAlert, AlertRender } = useCustomAlert();

    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [keyboardOffset, setKeyboardOffset] = useState(0);
    const [attachedFile, setAttachedFile] =
        useState<AttachedFile | null>(null);
    const [messages, setMessages] = useState<Message[]>([
        DEFAULT_WELCOME_MESSAGE,
    ]);
    const [activePrompts, setActivePrompts] =
        useState<string[]>(DEFAULT_PROMPTS);
    const [isChatLoaded, setIsChatLoaded] = useState(false);
    const [selectedMessage, setSelectedMessage] =
        useState<Message | null>(null);
    const [optionsModalVisible, setOptionsModalVisible] =
        useState(false);
    const [clearModalVisible, setClearModalVisible] = useState(false);

    const flatListRef = useRef<FlatList<Message>>(null);
    const isMountedRef = useRef(true);
    const requestInFlightRef = useRef(false);

    const persistMessages = async (
        nextMessages: Message[]
    ): Promise<void> => {
        try {
            await AsyncStorage.setItem(
                chatHistoryKey,
                JSON.stringify(getPersistableMessages(nextMessages))
            );
        } catch (error) {
            console.error('[Lexie] Failed to save chat:', error);
        }
    };

    const scrollToBottom = (): void => {
        requestAnimationFrame(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
        });
    };

    useEffect(() => {
        isMountedRef.current = true;

        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        const loadChat = async (): Promise<void> => {
            try {
                const storedHistory = await AsyncStorage.getItem(
                    chatHistoryKey
                );

                if (!storedHistory) {
                    return;
                }

                const parsed = JSON.parse(storedHistory);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    const validMessages = parsed.filter(
                        (message): message is Message =>
                            message &&
                            typeof message.id === 'string' &&
                            typeof message.text === 'string' &&
                            (message.sender === 'user' ||
                                message.sender === 'ai')
                    );

                    if (validMessages.length > 0) {
                        const migratedMessages = [
                            DEFAULT_WELCOME_MESSAGE,
                            ...validMessages.filter(
                                (message) =>
                                    message.id !== '1' &&
                                    message.id !==
                                        DEFAULT_WELCOME_MESSAGE.id
                            ),
                        ];

                        setMessages(migratedMessages);
                        await persistMessages(migratedMessages);
                    }
                }
            } catch (error) {
                console.error('[Lexie] Failed to load chat:', error);
            } finally {
                if (isMountedRef.current) {
                    setIsChatLoaded(true);
                }
            }
        };

        void loadChat();
    }, []);

    useEffect(() => {
        if (!isChatLoaded) {
            return;
        }

        const incomingFile = route?.params?.attachedFile;
        const incomingPrompt = route?.params?.initialPrompt;
        const incomingPrompts = route?.params?.suggestedPrompts;

        if (
            incomingFile &&
            typeof incomingFile.name === 'string' &&
            typeof incomingFile.data === 'string'
        ) {
            setAttachedFile(incomingFile);
        }

        if (
            Array.isArray(incomingPrompts) &&
            incomingPrompts.every(
                (prompt: unknown) => typeof prompt === 'string'
            )
        ) {
            setActivePrompts(incomingPrompts.slice(0, 6));
        }

        if (typeof incomingPrompt === 'string' && incomingPrompt.trim()) {
            setInputText(incomingPrompt);
        }
    }, [
        isChatLoaded,
        route?.params?.attachedFile,
        route?.params?.initialPrompt,
        route?.params?.suggestedPrompts,
    ]);

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    useEffect(() => {
        if (Platform.OS === 'android') {
            const showSubscription = Keyboard.addListener(
                'keyboardDidShow',
                (event) => {
                    setKeyboardOffset(event.endCoordinates.height);
                    requestAnimationFrame(scrollToBottom);
                }
            );
            const hideSubscription = Keyboard.addListener(
                'keyboardDidHide',
                () => setKeyboardOffset(0)
            );

            return () => {
                showSubscription.remove();
                hideSubscription.remove();
            };
        }

        const showSubscription = Keyboard.addListener(
            'keyboardWillShow',
            scrollToBottom
        );

        return () => showSubscription.remove();
    }, []);

    const buildRecentHistory = (
        history: Message[]
    ): Array<{ role: 'assistant' | 'user'; content: string }> =>
        history
            .filter(
                (message) =>
                    message.id !== DEFAULT_WELCOME_MESSAGE.id &&
                    !message.isError &&
                    message.text.trim().length > 0
            )
            .slice(-15)
            .map((message) => {
                // Task S6: i-sanitize ang text ng user messages bago ito
                // ipadala sa /chat. Ang hiddenData ay galing na sa nilinis
                // na text (Result/OfflineDetail), kaya hindi na galawin.
                // Ang mga mensahe sa device ay nananatiling original.
                const outboundText =
                    message.sender === 'user'
                        ? sanitizeLocalText(message.text)
                        : message.text;

                const content = message.hiddenData
                    ? `[PREVIOUSLY ATTACHED DOCUMENT: ${
                          message.attachedFileName || 'document'
                      }]\n${message.hiddenData}\n\nUSER MESSAGE:\n${
                          outboundText
                      }`
                    : outboundText;
                return {
                    role:
                        message.sender === 'ai'
                            ? 'assistant'
                            : 'user',
                    content,
                };
            });

    const sendMessage = async (
        options: SendOptions = {}
    ): Promise<void> => {
        if (requestInFlightRef.current || isLoading) {
            return;
        }

        const mode = options.mode || 'new';
        const userText = (options.text ?? inputText).trim();
        const fileName =
            options.fileName ?? attachedFile?.name ?? undefined;
        const hiddenData =
            options.hiddenData ?? attachedFile?.data ?? undefined;

        if (!userText && !hiddenData) {
            return;
        }

        const baseDisplayHistory = options.displayHistory || messages;
        const contextHistory =
            options.contextHistory || baseDisplayHistory;
        // Task S6: i-sanitize ang text ng user bago buuin ang payload.
        // Ang ipinapakitang mensahe at ang naka-save sa device ay
        // nananatiling original — ang safeUserText ay para sa pagpapadala
        // lang.
        const safeUserText = sanitizeLocalText(userText);

        // Kung puro redaction ang natira sa mensahe, huwag nang ipadala.
        if (userText && !safeUserText.trim()) {
            const blockedMessage: Message = {
                id: createMessageId('lexie'),
                text: 'Walang maipapadala. Subukang alisin ang personal na detalye sa mensahe.',
                sender: 'ai',
                isError: true,
            };

            setMessages([...baseDisplayHistory, blockedMessage]);
            return;
        }

        const messageWasRedacted =
            Boolean(userText) && safeUserText !== userText;

        const userMessage: Message = {
            id: createMessageId('user'),
            text: userText || 'Pakisuri ang attached document.',
            sender: 'user',
            attachedFileName: fileName,
            hiddenData,
            redactedNote: messageWasRedacted,
        };

        const pendingMessages =
            mode === 'regenerate'
                ? baseDisplayHistory
                : [...baseDisplayHistory, userMessage];

        setMessages(pendingMessages);
        setInputText('');
        setAttachedFile(null);
        setIsLoading(true);
        requestInFlightRef.current = true;
        Keyboard.dismiss();

        const payloadSections: string[] = [];

        if (hiddenData) {
            payloadSections.push(
                `[ATTACHED DOCUMENT CONTEXT: ${
                    fileName || 'document'
                }]\n\n${hiddenData}`
            );
        }

        payloadSections.push(
            `[CURRENT USER QUESTION]\n${
                safeUserText || 'Pakisuri ang document na ito.'
            }`
        );

        try {
            await persistMessages(pendingMessages);

            const data = await postEndpoint('/chat', {
                message: payloadSections.join('\n\n'),
                history: buildRecentHistory(contextHistory),
            });

            if (data?.status !== 'success') {
                throw new Error(data?.message || 'Chat request failed.');
            }

            const reply = String(
                data.reply || data.data?.reply || ''
            ).trim();

            if (!reply) {
                throw new Error('Empty response from server.');
            }

            const lexieMessage: Message = {
                id: createMessageId('lexie'),
                text: reply,
                sender: 'ai',
            };
            const completedMessages = [
                ...pendingMessages,
                lexieMessage,
            ];

            await persistMessages(completedMessages);

            if (isMountedRef.current) {
                setMessages(completedMessages);
            }
        } catch (error) {
            console.error('[Lexie] Send failed:', error);

            // Task S6: ang daily-limit na mensahe ng server (nagsisimula sa
            // "Abot na ang...") ay para mismo sa user — ipakita iyon nang
            // buo. Para sa ibang error, panatilihin ang generic na mensahe.
            const rawErrorMessage =
                error instanceof Error ? error.message : '';
            const outboundErrorText = rawErrorMessage.startsWith(
                'Abot na ang'
            )
                ? rawErrorMessage
                : 'Hindi ako makakonekta ngayon. Suriin ang internet at subukan ulit.';

            const errorMessage: Message = {
                id: createMessageId('lexie'),
                text: outboundErrorText,
                sender: 'ai',
                isError: true,
            };

            const failedMessages = [...pendingMessages, errorMessage];
            await persistMessages(failedMessages);

            if (isMountedRef.current) {
                setMessages(failedMessages);
            }
        } finally {
            requestInFlightRef.current = false;

            if (isMountedRef.current) {
                setIsLoading(false);
            }
        }
    };

    const handleRegenerate = async (
        aiMessageId: string
    ): Promise<void> => {
        if (isLoading || requestInFlightRef.current) {
            return;
        }

        const aiIndex = messages.findIndex(
            (message) => message.id === aiMessageId
        );

        if (aiIndex < 1 || messages[aiIndex].sender !== 'ai') {
            return;
        }

        const previousUserMessage = messages[aiIndex - 1];
        if (previousUserMessage.sender !== 'user') {
            return;
        }

        if (
            previousUserMessage.attachedFileName &&
            !previousUserMessage.hiddenData
        ) {
            showAlert(
                'Kailangan ulit ang document',
                'Hindi sine-save sa chat history ang document text. Buksan o i-attach ulit ang document para masuri ito.',
                'info'
            );
            return;
        }

        const displayHistory = messages.filter(
            (message) => message.id !== aiMessageId
        );
        const contextHistory = messages.slice(0, aiIndex - 1);

        await sendMessage({
            text: previousUserMessage.text,
            hiddenData: previousUserMessage.hiddenData,
            fileName: previousUserMessage.attachedFileName,
            mode: 'regenerate',
            displayHistory,
            contextHistory,
        });
    };

    const openMessageOptions = (message: Message): void => {
        if (isLoading) {
            return;
        }

        setSelectedMessage(message);
        setOptionsModalVisible(true);
    };

    const confirmUnsend = async (): Promise<void> => {
        if (!selectedMessage || isLoading) {
            return;
        }

        const selectedIndex = messages.findIndex(
            (message) => message.id === selectedMessage.id
        );

        if (selectedIndex < 0) {
            return;
        }

        const removeCount =
            messages[selectedIndex + 1]?.sender === 'ai' ? 2 : 1;
        const updatedMessages = [...messages];
        updatedMessages.splice(selectedIndex, removeCount);

        setOptionsModalVisible(false);
        setSelectedMessage(null);
        setMessages(updatedMessages);
        await persistMessages(updatedMessages);
    };

    const requestClearChat = (): void => {
        if (isLoading) {
            showAlert(
                'Sandali lang',
                'Hintayin munang matapos ang kasalukuyang sagot.',
                'info'
            );
            return;
        }

        setClearModalVisible(true);
    };

    const confirmClearChat = async (): Promise<void> => {
        setClearModalVisible(false);
        setAttachedFile(null);
        setInputText('');
        setMessages([DEFAULT_WELCOME_MESSAGE]);
        await persistMessages([DEFAULT_WELCOME_MESSAGE]);
    };

    const renderMessage = ({
        item,
        index,
    }: {
        item: Message;
        index: number;
    }) => (
        <MessageBubble
            item={item}
            isLastMessage={index === messages.length - 1}
            isLoading={isLoading}
            onOptions={openMessageOptions}
            onRegenerate={(messageId) =>
                void handleRegenerate(messageId)
            }
            T={T}
        />
    );

    const chatContent = (
        <>
            <FlatList
                ref={flatListRef}
                style={styles.messageList}
                data={messages}
                keyExtractor={(item) => item.id}
                renderItem={renderMessage}
                contentContainerStyle={styles.chatContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                onContentSizeChange={scrollToBottom}
                onLayout={scrollToBottom}
                ListFooterComponent={
                    isLoading ? (
                        <View style={styles.loadingRow}>
                            <View
                                style={[
                                    styles.lexieAvatar,
                                    {
                                        backgroundColor: T.card,
                                        borderColor: T.ink,
                                    },
                                ]}
                            >
                                <Image
                                    source={require('../../../../assets/icons/chat_ai.png')}
                                    style={styles.lexieAvatarImage}
                                    resizeMode="contain"
                                />
                            </View>
                            <View
                                style={[
                                    styles.loadingBubble,
                                    {
                                        backgroundColor: T.card,
                                        borderColor: T.ink,
                                    },
                                ]}
                            >
                                <ActivityIndicator
                                    size="small"
                                    color={T.brand}
                                />
                                <Text
                                    style={[
                                        styles.loadingText,
                                        { color: T.subText },
                                    ]}
                                >
                                    TINITINGNAN NI LEXIE...
                                </Text>
                            </View>
                        </View>
                    ) : null
                }
            />

            <View
                style={[
                    styles.composerArea,
                    {
                        backgroundColor: T.bg,
                        borderColor: T.ink,
                    },
                ]}
            >
                {messages.length === 1 && !isLoading && (
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={styles.promptContent}
                    >
                        {activePrompts.map((prompt) => (
                            <TouchableOpacity
                                key={prompt}
                                style={[
                                    styles.promptChip,
                                    {
                                        backgroundColor: T.card,
                                        borderColor: T.ink,
                                    },
                                ]}
                                onPress={() => setInputText(prompt)}
                                accessibilityRole="button"
                            >
                                <Text
                                    style={[
                                        styles.promptText,
                                        { color: T.text },
                                    ]}
                                    numberOfLines={2}
                                >
                                    {prompt}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                )}

                {attachedFile && (
                    <View
                        style={[
                            styles.attachedFile,
                            {
                                backgroundColor: T.brandSoft,
                                borderColor: T.ink,
                            },
                        ]}
                    >
                        <View
                            style={[
                                styles.attachedFileIcon,
                                { backgroundColor: T.brand },
                            ]}
                        >
                            <Ionicons
                                name="document-text-outline"
                                size={17}
                                color={T.brandText}
                            />
                        </View>
                        <View style={styles.attachedFileCopy}>
                            <Text
                                style={[
                                    styles.attachedFileName,
                                    { color: T.text },
                                ]}
                                numberOfLines={1}
                            >
                                {attachedFile.name}
                            </Text>
                            <Text
                                style={[
                                    styles.attachedFileStatus,
                                    { color: T.brandDeep },
                                ]}
                            >
                                HANDA NANG ITANONG
                            </Text>
                        </View>
                        <TouchableOpacity
                            style={styles.removeFileButton}
                            onPress={() => setAttachedFile(null)}
                            accessibilityRole="button"
                            accessibilityLabel="Tanggalin ang document"
                        >
                            <Ionicons
                                name="close"
                                size={20}
                                color={T.subText}
                            />
                        </TouchableOpacity>
                    </View>
                )}

                <View style={styles.inputRow}>
                    <View
                        style={[
                            styles.inputBox,
                            {
                                backgroundColor: T.card,
                                borderColor: T.ink,
                            },
                        ]}
                    >
                        <TextInput
                            style={[styles.textInput, { color: T.text }]}
                            placeholder={
                                attachedFile
                                    ? 'Magtanong tungkol sa document'
                                    : 'Magtanong kay Lexie'
                            }
                            placeholderTextColor={T.subText}
                            value={inputText}
                            onChangeText={setInputText}
                            multiline
                            maxLength={1000}
                            editable={!isLoading}
                            onFocus={scrollToBottom}
                            accessibilityLabel="Mensahe kay Lexie"
                        />
                    </View>

                    <TouchableOpacity
                        style={[
                            styles.sendButton,
                            {
                                backgroundColor: T.brand,
                                borderColor: T.ink,
                            },
                            getNeoShadow(T, 'sm'),
                            (!inputText.trim() && !attachedFile) ||
                            isLoading
                                ? styles.sendButtonDisabled
                                : null,
                        ]}
                        onPress={() => void sendMessage()}
                        disabled={
                            (!inputText.trim() && !attachedFile) ||
                            isLoading
                        }
                        accessibilityRole="button"
                        accessibilityLabel="Ipadala"
                    >
                        <Ionicons
                            name="send"
                            size={18}
                            color={T.brandText}
                        />
                    </TouchableOpacity>
                </View>

                <Text
                    style={[styles.composerNote, { color: T.subText }]}
                >
                    PARA SA PAG-UNAWA LAMANG, HINDI LEGAL ADVICE.
                </Text>
            </View>

            <Modal
                visible={optionsModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setOptionsModalVisible(false)}
            >
                <TouchableOpacity
                    style={[
                        styles.modalBackdrop,
                        { backgroundColor: T.overlay },
                    ]}
                    activeOpacity={1}
                    onPress={() => setOptionsModalVisible(false)}
                >
                    <TouchableWithoutFeedback>
                        <View
                            style={[
                                styles.optionsModal,
                                {
                                    backgroundColor: T.card,
                                    borderColor: T.ink,
                                },
                                getNeoShadow(T, 'sm'),
                            ]}
                        >
                            <Text
                                style={[
                                    styles.modalTitle,
                                    { color: T.text },
                                ]}
                            >
                                MENSAHE
                            </Text>
                            <TouchableOpacity
                                style={styles.optionButton}
                                onPress={() => void confirmUnsend()}
                            >
                                <Ionicons
                                    name="trash-outline"
                                    size={20}
                                    color={T.danger}
                                />
                                <Text
                                    style={[
                                        styles.deleteOptionText,
                                        { color: T.danger },
                                    ]}
                                >
                                    BURAHIN ANG MENSAHE
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.optionButton,
                                    { borderTopColor: T.border },
                                ]}
                                onPress={() =>
                                    setOptionsModalVisible(false)
                                }
                            >
                                <Ionicons
                                    name="close-outline"
                                    size={20}
                                    color={T.subText}
                                />
                                <Text
                                    style={[
                                        styles.optionText,
                                        { color: T.text },
                                    ]}
                                >
                                    KANSELAHIN
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableWithoutFeedback>
                </TouchableOpacity>
            </Modal>

            <Modal
                visible={clearModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setClearModalVisible(false)}
            >
                <TouchableOpacity
                    style={[
                        styles.modalBackdrop,
                        { backgroundColor: T.overlay },
                    ]}
                    activeOpacity={1}
                    onPress={() => setClearModalVisible(false)}
                >
                    <TouchableWithoutFeedback>
                        <View
                            style={[
                                styles.confirmModal,
                                {
                                    backgroundColor: T.card,
                                    borderColor: T.ink,
                                },
                                getNeoShadow(T, 'sm'),
                            ]}
                        >
                            <View style={[styles.modalHandle, { backgroundColor: T.border }]} />
                            <Text
                                style={[
                                    styles.modalTitle,
                                    { color: T.text },
                                ]}
                            >
                                BURAHIN ANG CONVERSATION?
                            </Text>
                            <Text
                                style={[
                                    styles.confirmText,
                                    { color: T.subText },
                                ]}
                            >
                                Hindi na maibabalik ang mga mensahe.
                            </Text>
                            <View style={styles.modalButtonRow}>
                                <TouchableOpacity
                                    style={[
                                        styles.secondaryModalButton,
                                        {
                                            backgroundColor: T.bg,
                                            borderColor: T.ink,
                                        },
                                    ]}
                                    onPress={() =>
                                        setClearModalVisible(false)
                                    }
                                >
                                    <Text
                                        style={[
                                            styles.secondaryModalButtonText,
                                            { color: T.text },
                                        ]}
                                    >
                                        KANSELAHIN
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[
                                        styles.deleteModalButton,
                                        {
                                            backgroundColor: T.danger,
                                            borderColor: T.ink,
                                        },
                                        getNeoShadow(T, 'sm'),
                                    ]}
                                    onPress={() => void confirmClearChat()}
                                >
                                    <Text
                                        style={[
                                            styles.deleteModalButtonText,
                                            { color: T.brandText },
                                        ]}
                                    >
                                        BURAHIN
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </TouchableWithoutFeedback>
                </TouchableOpacity>
            </Modal>
        </>
    );

    return (
        <ScreenLayout
            title="Lexie Ai"
            noPadding
            rightIcon="trash-outline"
            onRightPress={requestClearChat}
        >
            {Platform.OS === 'ios' ? (
                <KeyboardAvoidingView
                    style={[styles.screen, { backgroundColor: T.bg }]}
                    behavior="padding"
                    keyboardVerticalOffset={88}
                >
                    {chatContent}
                </KeyboardAvoidingView>
            ) : (
                <View
                    style={[
                        styles.screen,
                        { backgroundColor: T.bg },
                        keyboardOffset > 0 && {
                            paddingBottom: keyboardOffset,
                        },
                    ]}
                >
                    {chatContent}
                </View>
            )}
        </ScreenLayout>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    chatContent: {
        flexGrow: 1,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 10,
    },
    messageList: {
        flex: 1,
        minHeight: 0,
    },
    messageBlock: {
        width: '100%',
        marginBottom: 14,
    },
    messageRow: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'flex-end',
    },
    userMessageRow: {
        justifyContent: 'flex-end',
    },
    lexieMessageRow: {
        justifyContent: 'flex-start',
    },
    lexieAvatar: {
        width: 30,
        height: 30,
        borderRadius: RADIUS.lg,
        borderWidth: BORDER.thin,
        marginRight: 8,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    lexieAvatarImage: {
        width: 22,
        height: 22,
    },
    bubblePressArea: {
        maxWidth: '84%',
    },
    bubble: {
        borderRadius: RADIUS.lg,
        borderWidth: BORDER.thin,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    fileLabel: {
        maxWidth: 230,
        minHeight: 28,
        borderRadius: RADIUS.sm,
        borderWidth: BORDER.thin,
        paddingHorizontal: 7,
        marginBottom: 7,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    fileLabelText: {
        flex: 1,
        minWidth: 0,
        fontSize: 10,
        fontWeight: '800',
    },
    redactedNoteText: {
        fontSize: 11,
        lineHeight: 15,
        fontStyle: 'italic',
        marginTop: 4,
        alignSelf: 'flex-end',
    },
    messageText: {
        fontSize: 13,
        lineHeight: 20,
    },
    regenerateButton: {
        alignSelf: 'flex-start',
        minHeight: 32,
        marginLeft: 38,
        marginTop: 4,
        paddingHorizontal: 4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    regenerateText: {
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.8,
    },
    loadingRow: {
        marginBottom: 14,
        flexDirection: 'row',
        alignItems: 'flex-end',
    },
    loadingBubble: {
        minHeight: 42,
        borderRadius: RADIUS.lg,
        borderWidth: BORDER.thin,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    loadingText: {
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.8,
    },
    composerArea: {
        borderTopWidth: BORDER.thin,
        paddingTop: 9,
        paddingBottom: Platform.OS === 'ios' ? 18 : 10,
    },
    promptContent: {
        paddingHorizontal: 16,
        paddingBottom: 9,
        gap: 7,
    },
    promptChip: {
        maxWidth: 210,
        minHeight: 38,
        borderRadius: RADIUS.md,
        borderWidth: BORDER.thin,
        paddingHorizontal: 11,
        paddingVertical: 7,
        justifyContent: 'center',
    },
    promptText: {
        fontSize: 11,
        lineHeight: 15,
        fontWeight: '800',
    },
    attachedFile: {
        minHeight: 52,
        borderRadius: RADIUS.lg,
        borderWidth: BORDER.thin,
        marginHorizontal: 16,
        marginBottom: 8,
        paddingHorizontal: 9,
        flexDirection: 'row',
        alignItems: 'center',
    },
    attachedFileIcon: {
        width: 32,
        height: 32,
        borderRadius: RADIUS.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    attachedFileCopy: {
        flex: 1,
        minWidth: 0,
        marginLeft: 9,
    },
    attachedFileName: {
        fontSize: 12,
        fontWeight: '800',
    },
    attachedFileStatus: {
        marginTop: 2,
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.8,
    },
    removeFileButton: {
        width: 38,
        height: 42,
        alignItems: 'center',
        justifyContent: 'center',
    },
    inputRow: {
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 8,
    },
    inputBox: {
        flex: 1,
        minWidth: 0,
        minHeight: 46,
        maxHeight: 112,
        borderRadius: RADIUS.md,
        borderWidth: BORDER.thin,
        paddingLeft: 11,
        paddingRight: 11,
        flexDirection: 'row',
        alignItems: 'flex-end',
    },
    textInput: {
        flex: 1,
        minWidth: 0,
        maxHeight: 105,
        paddingTop: 12,
        paddingBottom: 11,
        fontSize: 13,
        lineHeight: 19,
    },
    sendButton: {
        width: 46,
        height: 46,
        borderRadius: RADIUS.md,
        borderWidth: BORDER.thick,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendButtonDisabled: {
        opacity: 0.4,
    },
    composerNote: {
        marginTop: 6,
        paddingHorizontal: 16,
        fontSize: 9,
        lineHeight: 12,
        letterSpacing: 0.6,
        textAlign: 'center',
    },
    modalBackdrop: {
        flex: 1,
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    optionsModal: {
        width: '100%',
        maxWidth: 380,
        borderRadius: RADIUS.lg,
        borderWidth: BORDER.thick,
        padding: 16,
    },
    confirmModal: {
        width: '100%',
        maxWidth: 380,
        borderRadius: RADIUS.lg,
        borderWidth: BORDER.thick,
        padding: 18,
    },
    modalHandle: {
        width: 34,
        height: 3,
        borderRadius: RADIUS.sm,
        marginBottom: 14,
        alignSelf: 'center',
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: 0.5,
        textAlign: 'center',
    },
    modalButtonRow: {
        width: '100%',
        flexDirection: 'row',
        gap: 8,
        marginTop: 14,
    },
    secondaryModalButton: {
        flex: 1,
        minHeight: 44,
        borderRadius: RADIUS.md,
        borderWidth: BORDER.thin,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 10,
    },
    secondaryModalButtonText: {
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 0.5,
    },
    optionButton: {
        minHeight: 48,
        borderTopWidth: 1,
        borderTopColor: 'transparent',
        paddingHorizontal: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
    },
    optionText: {
        fontSize: 13,
        fontWeight: '800',
    },
    deleteOptionText: {
        fontSize: 13,
        fontWeight: '800',
    },
    confirmText: {
        marginTop: 7,
        fontSize: 12,
        lineHeight: 18,
        textAlign: 'center',
    },
    deleteModalButton: {
        flex: 1,
        minHeight: 44,
        borderRadius: RADIUS.md,
        borderWidth: BORDER.thick,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 10,
    },
    deleteModalButtonText: {
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 0.5,
    },
});