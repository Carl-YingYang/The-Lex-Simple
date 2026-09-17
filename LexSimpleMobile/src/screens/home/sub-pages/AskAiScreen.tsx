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

import {
    ExpoSpeechRecognitionModule,
    useSpeechRecognitionEvent,
} from '../../../services/SpeechRecognitionSafe';
import ScreenLayout from '../../../components/ScreenLayout';
import { useCustomAlert } from '../../../components/CustomAlert';
import { postEndpoint } from '../../../services/AiEngine';
import { useTheme } from '../../../theme/ThemeContext';

const CHAT_HISTORY_KEY = '@lex_chat_history';
const PRIMARY = '#3478F6';
const PRIMARY_SOFT = '#66A0FF';
const DANGER = '#EF4444';

interface Message {
    id: string;
    text: string;
    sender: 'user' | 'ai';
    isError?: boolean;
    attachedFileName?: string;
    hiddenData?: string;
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
    'I-summarize ang document.',
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
            <View
                style={[
                    styles.messageRow,
                    isUser
                        ? styles.userMessageRow
                        : styles.lexieMessageRow,
                ]}
            >
                {!isUser && (
                    <View
                        style={[
                            styles.lexieAvatar,
                            {
                                backgroundColor: T.card,
                                borderColor: T.border,
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
                                ? styles.userBubble
                                : {
                                      backgroundColor: T.card,
                                      borderColor: T.border,
                                  },
                            item.isError && {
                                borderColor: DANGER,
                            },
                        ]}
                    >
                        {item.attachedFileName && (
                            <View
                                style={[
                                    styles.fileLabel,
                                    {
                                        backgroundColor: isUser
                                            ? 'rgba(255,255,255,0.14)'
                                            : T.bg,
                                        borderColor: isUser
                                            ? 'rgba(255,255,255,0.24)'
                                            : T.border,
                                    },
                                ]}
                            >
                                <Ionicons
                                    name="document-text-outline"
                                    size={14}
                                    color={isUser ? '#FFFFFF' : T.text}
                                />
                                <Text
                                    style={[
                                        styles.fileLabelText,
                                        {
                                            color: isUser
                                                ? '#FFFFFF'
                                                : T.text,
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
                                        ? '#FFFFFF'
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
                            Subukan ulit
                        </Text>
                    </TouchableOpacity>
                )}
        </View>
    );
};

export default function AskAiScreen({ route }: any) {
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
    const [isMicModalVisible, setIsMicModalVisible] = useState(false);
    const [isListening, setIsListening] = useState(false);

    const flatListRef = useRef<FlatList<Message>>(null);
    const originalTextRef = useRef('');
    const isMountedRef = useRef(true);
    const requestInFlightRef = useRef(false);

    const persistMessages = async (
        nextMessages: Message[]
    ): Promise<void> => {
        try {
            await AsyncStorage.setItem(
                CHAT_HISTORY_KEY,
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

    useSpeechRecognitionEvent('start', () => {
        setIsListening(true);
    });

    useSpeechRecognitionEvent('end', () => {
        setIsListening(false);
    });

    useSpeechRecognitionEvent('error', (event) => {
        setIsListening(false);

        if (event.error === 'client' || event.error === 'network') {
            showAlert(
                'Hindi gumana ang microphone',
                'Subukang muli o i-type na lang ang mensahe.',
                'error'
            );
        }
    });

    useSpeechRecognitionEvent('result', (event) => {
        const transcript = event.results?.[0]?.transcript;

        if (!transcript) {
            return;
        }

        const baseText = originalTextRef.current;
        const separator =
            baseText.length > 0 && !baseText.endsWith(' ') ? ' ' : '';

        setInputText(`${baseText}${separator}${transcript}`);
    });

    useEffect(() => {
        isMountedRef.current = true;

        return () => {
            isMountedRef.current = false;

            try {
                ExpoSpeechRecognitionModule.stop();
            } catch {
                // Speech recognition may already be stopped.
            }
        };
    }, []);

    useEffect(() => {
        const loadChat = async (): Promise<void> => {
            try {
                const storedHistory = await AsyncStorage.getItem(
                    CHAT_HISTORY_KEY
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

    const openMicModal = async (): Promise<void> => {
        Keyboard.dismiss();
        originalTextRef.current = inputText;

        try {
            const permission =
                await ExpoSpeechRecognitionModule.requestPermissionsAsync();

            if (!permission?.granted) {
                showAlert(
                    'Kailangan ang microphone',
                    'Payagan ang microphone access para magamit ang voice input.',
                    'info'
                );
                return;
            }

            setIsMicModalVisible(true);
            await ExpoSpeechRecognitionModule.start({
                lang: 'fil-PH',
                interimResults: true,
            });
        } catch (error: any) {
            setIsListening(false);
            setIsMicModalVisible(false);
            showAlert(
                'Hindi gumana ang microphone',
                error?.message || 'I-type na lang muna ang mensahe.',
                'error'
            );
        }
    };

    const closeMicModal = (): void => {
        try {
            ExpoSpeechRecognitionModule.stop();
        } catch {
            // Speech recognition may already be stopped.
        }

        setIsListening(false);
        setIsMicModalVisible(false);
    };

    const toggleListening = async (): Promise<void> => {
        try {
            if (isListening) {
                ExpoSpeechRecognitionModule.stop();
                return;
            }

            originalTextRef.current = inputText;
            await ExpoSpeechRecognitionModule.start({
                lang: 'fil-PH',
                interimResults: true,
            });
        } catch (error) {
            console.error('[Lexie] Voice input failed:', error);
            setIsListening(false);
        }
    };

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
                const content = message.hiddenData
                    ? `[PREVIOUSLY ATTACHED DOCUMENT: ${
                          message.attachedFileName || 'document'
                      }]\n${message.hiddenData}\n\nUSER MESSAGE:\n${
                          message.text
                      }`
                    : message.text;

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

        try {
            if (isListening) {
                ExpoSpeechRecognitionModule.stop();
            }
        } catch {
            // Speech recognition may already be stopped.
        }

        const baseDisplayHistory = options.displayHistory || messages;
        const contextHistory =
            options.contextHistory || baseDisplayHistory;

        const userMessage: Message = {
            id: createMessageId('user'),
            text: userText || 'Pakisuri ang attached document.',
            sender: 'user',
            attachedFileName: fileName,
            hiddenData,
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
                userText || 'Pakisuri ang document na ito.'
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

            const errorMessage: Message = {
                id: createMessageId('lexie'),
                text:
                    'Hindi ako makakonekta ngayon. Suriin ang internet at subukan ulit.',
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

    const handleSendFromMic = (): void => {
        const voiceText = inputText;
        closeMicModal();
        void sendMessage({ text: voiceText });
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
                                        borderColor: T.border,
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
                                        borderColor: T.border,
                                    },
                                ]}
                            >
                                <ActivityIndicator
                                    size="small"
                                    color={PRIMARY_SOFT}
                                />
                                <Text
                                    style={[
                                        styles.loadingText,
                                        { color: T.subText },
                                    ]}
                                >
                                    Tinitingnan ni Lexie...
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
                        borderColor: T.border,
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
                                        borderColor: T.border,
                                    },
                                ]}
                                onPress={() => setInputText(prompt)}
                                accessibilityRole="button"
                            >
                                <Text
                                    style={[
                                        styles.promptText,
                                        { color: T.subText },
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
                                backgroundColor: T.card,
                                borderColor: T.border,
                            },
                        ]}
                    >
                        <View style={styles.attachedFileIcon}>
                            <Ionicons
                                name="document-text-outline"
                                size={17}
                                color="#FFFFFF"
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
                                    { color: T.subText },
                                ]}
                            >
                                Handa nang itanong
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
                                borderColor: T.border,
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

                        <TouchableOpacity
                            style={styles.inputIconButton}
                            onPress={() => void openMicModal()}
                            disabled={isLoading}
                            accessibilityRole="button"
                            accessibilityLabel="Gamitin ang microphone"
                        >
                            <Ionicons
                                name="mic-outline"
                                size={21}
                                color={T.subText}
                            />
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        style={[
                            styles.sendButton,
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
                            color="#FFFFFF"
                        />
                    </TouchableOpacity>
                </View>

                <Text
                    style={[styles.composerNote, { color: T.subText }]}
                >
                    Para sa pag-unawa lamang, hindi legal advice.
                </Text>
            </View>

            <Modal
                visible={isMicModalVisible}
                transparent
                animationType="fade"
                onRequestClose={closeMicModal}
            >
                <View style={styles.modalBackdrop}>
                    <View
                        style={[
                            styles.micModal,
                            {
                                backgroundColor: T.card,
                                borderColor: T.border,
                            },
                        ]}
                    >
                        <View style={styles.modalHandle} />
                        <Text
                            style={[
                                styles.modalTitle,
                                { color: T.text },
                            ]}
                        >
                            Voice input
                        </Text>
                        <Text
                            style={[
                                styles.micStatus,
                                { color: T.subText },
                            ]}
                        >
                            {isListening
                                ? 'Nakikinig si Lexie...'
                                : 'Naka-pause'}
                        </Text>

                        <View
                            style={[
                                styles.transcriptBox,
                                {
                                    backgroundColor: T.bg,
                                    borderColor: T.border,
                                },
                            ]}
                        >
                            <Text
                                style={[
                                    styles.transcriptText,
                                    { color: T.text },
                                ]}
                                numberOfLines={5}
                            >
                                {inputText
                                    .slice(originalTextRef.current.length)
                                    .trim() ||
                                    (isListening
                                        ? 'Magsalita ngayon...'
                                        : 'Wala pang narinig.')}
                            </Text>
                        </View>

                        <TouchableOpacity
                            style={[
                                styles.micButton,
                                {
                                    backgroundColor: isListening
                                        ? DANGER
                                        : PRIMARY,
                                },
                            ]}
                            onPress={() => void toggleListening()}
                            accessibilityRole="button"
                        >
                            <Ionicons
                                name={
                                    isListening
                                        ? 'pause-outline'
                                        : 'mic-outline'
                                }
                                size={27}
                                color="#FFFFFF"
                            />
                        </TouchableOpacity>

                        <View style={styles.modalButtonRow}>
                            <TouchableOpacity
                                style={[
                                    styles.secondaryModalButton,
                                    {
                                        backgroundColor: T.bg,
                                        borderColor: T.border,
                                    },
                                ]}
                                onPress={closeMicModal}
                            >
                                <Text
                                    style={[
                                        styles.secondaryModalButtonText,
                                        { color: T.text },
                                    ]}
                                >
                                    Kanselahin
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.primaryModalButton,
                                    !inputText.trim() &&
                                        styles.disabledButton,
                                ]}
                                onPress={handleSendFromMic}
                                disabled={!inputText.trim()}
                            >
                                <Text style={styles.primaryModalButtonText}>
                                    Ipadala
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal
                visible={optionsModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setOptionsModalVisible(false)}
            >
                <TouchableOpacity
                    style={styles.modalBackdrop}
                    activeOpacity={1}
                    onPress={() => setOptionsModalVisible(false)}
                >
                    <TouchableWithoutFeedback>
                        <View
                            style={[
                                styles.optionsModal,
                                {
                                    backgroundColor: T.card,
                                    borderColor: T.border,
                                },
                            ]}
                        >
                            <Text
                                style={[
                                    styles.modalTitle,
                                    { color: T.text },
                                ]}
                            >
                                Mensahe
                            </Text>
                            <TouchableOpacity
                                style={styles.optionButton}
                                onPress={() => void confirmUnsend()}
                            >
                                <Ionicons
                                    name="trash-outline"
                                    size={20}
                                    color={DANGER}
                                />
                                <Text style={styles.deleteOptionText}>
                                    Burahin ang mensahe
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
                                    Kanselahin
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
                    style={styles.modalBackdrop}
                    activeOpacity={1}
                    onPress={() => setClearModalVisible(false)}
                >
                    <TouchableWithoutFeedback>
                        <View
                            style={[
                                styles.confirmModal,
                                {
                                    backgroundColor: T.card,
                                    borderColor: T.border,
                                },
                            ]}
                        >
                            <View style={styles.modalHandle} />
                            <Text
                                style={[
                                    styles.modalTitle,
                                    { color: T.text },
                                ]}
                            >
                                Burahin ang conversation?
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
                                            borderColor: T.border,
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
                                        Kanselahin
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.deleteModalButton}
                                    onPress={() => void confirmClearChat()}
                                >
                                    <Text style={styles.deleteModalButtonText}>
                                        Burahin
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
            title="Ask AI"
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
        borderRadius: 6,
        borderWidth: 1,
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
        borderRadius: 7,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    userBubble: {
        backgroundColor: PRIMARY,
        borderColor: PRIMARY,
    },
    fileLabel: {
        maxWidth: 230,
        minHeight: 28,
        borderRadius: 5,
        borderWidth: 1,
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
        fontSize: 11,
        fontWeight: '700',
    },
    loadingRow: {
        marginBottom: 14,
        flexDirection: 'row',
        alignItems: 'flex-end',
    },
    loadingBubble: {
        minHeight: 42,
        borderRadius: 7,
        borderWidth: 1,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    loadingText: {
        fontSize: 11,
        fontWeight: '700',
    },
    composerArea: {
        borderTopWidth: 1,
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
        borderRadius: 6,
        borderWidth: 1,
        paddingHorizontal: 11,
        paddingVertical: 7,
        justifyContent: 'center',
    },
    promptText: {
        fontSize: 11,
        lineHeight: 15,
        fontWeight: '700',
    },
    attachedFile: {
        minHeight: 52,
        borderRadius: 7,
        borderWidth: 1,
        marginHorizontal: 16,
        marginBottom: 8,
        paddingHorizontal: 9,
        flexDirection: 'row',
        alignItems: 'center',
    },
    attachedFileIcon: {
        width: 32,
        height: 32,
        borderRadius: 6,
        backgroundColor: PRIMARY,
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
        fontWeight: '700',
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
        borderRadius: 7,
        borderWidth: 1,
        paddingLeft: 11,
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
    inputIconButton: {
        width: 42,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendButton: {
        width: 46,
        height: 46,
        borderRadius: 7,
        backgroundColor: PRIMARY,
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
        textAlign: 'center',
    },
    modalBackdrop: {
        flex: 1,
        padding: 20,
        backgroundColor: 'rgba(0,0,0,0.60)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    micModal: {
        width: '100%',
        maxWidth: 380,
        borderRadius: 8,
        borderWidth: 1,
        padding: 18,
        alignItems: 'center',
    },
    optionsModal: {
        width: '100%',
        maxWidth: 380,
        borderRadius: 8,
        borderWidth: 1,
        padding: 16,
    },
    confirmModal: {
        width: '100%',
        maxWidth: 380,
        borderRadius: 8,
        borderWidth: 1,
        padding: 18,
    },
    modalHandle: {
        width: 34,
        height: 3,
        borderRadius: 2,
        backgroundColor: '#64748B',
        opacity: 0.45,
        marginBottom: 14,
        alignSelf: 'center',
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: '900',
        textAlign: 'center',
    },
    micStatus: {
        marginTop: 4,
        fontSize: 11,
        fontWeight: '700',
        textAlign: 'center',
    },
    transcriptBox: {
        width: '100%',
        minHeight: 82,
        borderRadius: 7,
        borderWidth: 1,
        padding: 11,
        marginTop: 14,
        marginBottom: 14,
        justifyContent: 'center',
    },
    transcriptText: {
        fontSize: 13,
        lineHeight: 20,
        textAlign: 'center',
    },
    micButton: {
        width: 58,
        height: 58,
        borderRadius: 29,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
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
        borderRadius: 6,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 10,
    },
    secondaryModalButtonText: {
        fontSize: 12,
        fontWeight: '900',
    },
    primaryModalButton: {
        flex: 1,
        minHeight: 44,
        borderRadius: 6,
        backgroundColor: PRIMARY,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 10,
    },
    primaryModalButtonText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '900',
    },
    disabledButton: {
        opacity: 0.45,
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
        color: DANGER,
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
        borderRadius: 6,
        backgroundColor: DANGER,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 10,
    },
    deleteModalButtonText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '900',
    },
});
