import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, Keyboard, ScrollView, Alert, StyleSheet, Animated, PanResponder, Modal, TouchableWithoutFeedback, LogBox } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from '../../../services/SpeechRecognitionSafe';
import { COLORS } from '../../../theme/globalStyles';
import ScreenLayout from '../../../components/ScreenLayout';
import { postEndpoint } from '../../../services/AiEngine';

LogBox.ignoreLogs(['The app is running using the Legacy Architecture', 'Voice Error']);

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  isError?: boolean;
  attachedFileName?: string;
  hiddenData?: string;
}

const DEFAULT_WELCOME_MSG: Message = {
  id: '1',
  text: "Hello! Ako si Lex-Simple AI. ⚖️\n\nPaalala: Isa lamang akong Legal Literacy Tool at hindi pamalit sa payo ng isang lisensyadong abogado. Paano kita matutulungan ngayon?",
  sender: 'ai',
};

const TypeWriterText = ({ text, style, onComplete }: { text: string, style: any, onComplete: () => void }) => {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i += Math.floor(Math.random() * 4) + 2;
      if (i >= text.length) {
        setDisplayedText(text);
        clearInterval(interval);
        onComplete();
      } else {
        setDisplayedText(text.slice(0, i));
      }
    }, 15);
    return () => clearInterval(interval);
  }, [text]);

  return <Text style={style}>{displayedText}</Text>;
};

const TypingIndicator = () => {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = () => {
      Animated.sequence([
        Animated.stagger(150, [
          Animated.timing(dot1, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot2, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot3, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]),
        Animated.stagger(150, [
          Animated.timing(dot1, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.timing(dot2, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.timing(dot3, { toValue: 0, duration: 300, useNativeDriver: true }),
        ])
      ]).start(() => animate());
    };
    animate();
  }, []);

  const getStyle = (anim: Animated.Value) => ({
    opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }]
  });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 16, paddingHorizontal: 2 }}>
      <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#94A3B8', marginHorizontal: 3 }, getStyle(dot1)]} />
      <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#94A3B8', marginHorizontal: 3 }, getStyle(dot2)]} />
      <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#94A3B8', marginHorizontal: 3 }, getStyle(dot3)]} />
    </View>
  );
};

const SwipeableMessage = ({ item, index, isUser, isLastMsg, isLoading, onReply, onOptions, onRegenerate, shouldAnimate, onTypingComplete }: any) => {
  const pan = useRef(new Animated.ValueXY()).current;
  const [isTypingLocal, setIsTypingLocal] = useState(shouldAnimate);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dx > 10 && Math.abs(gestureState.dy) < 10,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx > 0 && gestureState.dx <= 60) pan.setValue({ x: gestureState.dx, y: 0 });
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 45) onReply(item);
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      }
    })
  ).current;

  const replyIconOpacity = pan.x.interpolate({ inputRange: [0, 20, 50], outputRange: [0, 0, 1], extrapolate: 'clamp' });
  const replyIconScale = pan.x.interpolate({ inputRange: [0, 20, 50], outputRange: [0.5, 0.8, 1], extrapolate: 'clamp' });

  const handleTypingDone = () => { setIsTypingLocal(false); if (onTypingComplete) onTypingComplete(item.id); };

  return (
    <View style={{ marginBottom: 16, width: '100%', position: 'relative' }}>
      <Animated.View style={[{ position: 'absolute', left: 15, top: '30%', zIndex: -1 }, { opacity: replyIconOpacity, transform: [{ scale: replyIconScale }] }]}>
        <Ionicons name="arrow-undo" size={20} color="#64748B" />
      </Animated.View>

      <Animated.View {...panResponder.panHandlers} style={[{ flexDirection: 'row', alignItems: 'flex-end', width: '100%' }, isUser ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' }, { transform: [{ translateX: pan.x }] }]}>
        {!isUser && (
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(129, 140, 248, 0.15)', justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
            <Ionicons name="sparkles" size={14} color={COLORS.primaryLight} />
          </View>
        )}
        <TouchableOpacity activeOpacity={0.9} onLongPress={() => item.id !== '1' ? onOptions(item) : null} delayLongPress={400} style={{ maxWidth: '82%' }}>
          <View style={[uiStyles.bubble, isUser ? uiStyles.userBubble : uiStyles.aiBubble, item.isError && uiStyles.errorBubble]}>
            {item.attachedFileName && (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 6 }}>
                <Ionicons name="document-text" size={12} color="#fff" style={{ marginRight: 6 }} />
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }} numberOfLines={1}>{item.attachedFileName}</Text>
              </View>
            )}
            {!isUser && shouldAnimate ? (
              <TypeWriterText text={item.text} style={[uiStyles.messageText, uiStyles.aiText]} onComplete={handleTypingDone} />
            ) : (
              <Text style={[uiStyles.messageText, isUser ? uiStyles.userText : uiStyles.aiText]}>{item.text}</Text>
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>

      {isUser && index === 1 && <Text style={{ color: '#64748B', fontSize: 10, alignSelf: 'flex-end', marginTop: 6, marginRight: 4, fontStyle: 'italic' }}>Swipe right to reply • Long-press for options</Text>}

      {!isUser && isLastMsg && !item.isError && item.id !== '1' && !isLoading && !isTypingLocal && (
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginLeft: 42 }} onPress={() => onRegenerate(item.id)}>
          <Ionicons name="refresh-outline" size={14} color="#64748B" />
          <Text style={{ color: '#64748B', fontSize: 12, marginLeft: 4, fontWeight: '600' }}>Regenerate</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default function AskAiScreen({ route }: any) {
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [attachedFile, setAttachedFile] = useState<{ name: string, data: string } | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [optionsModalVisible, setOptionsModalVisible] = useState(false);
  const [clearModalVisible, setClearModalVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);

  const [isMicModalVisible, setIsMicModalVisible] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const originalTextRef = useRef('');
  const micScaleAnim = useRef(new Animated.Value(1)).current;

  const animatedMessageIds = useRef<Set<string>>(new Set(['1']));
  const flatListRef = useRef<FlatList>(null);
  const isMounted = useRef(true);

  const [activePrompts, setActivePrompts] = useState<string[]>(["Paki-summarize ang dokumentong ito.", "Mayroon bang hidden risks dito?", "Ano ang mga karapatan ko rito?", "Ipaliwanag nang simple."]);
  const [messages, setMessages] = useState<Message[]>([DEFAULT_WELCOME_MSG]);
  const [isChatLoaded, setIsChatLoaded] = useState(false);
  const hasAutoSent = useRef(false);

  useEffect(() => {
    let loopAnim: Animated.CompositeAnimation | null = null;
    if (isListening) {
      loopAnim = Animated.loop(
        Animated.sequence([
          Animated.timing(micScaleAnim, { toValue: 1.25, duration: 500, useNativeDriver: true }),
          Animated.timing(micScaleAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      loopAnim.start();
    } else {
      micScaleAnim.stopAnimation();
      micScaleAnim.setValue(1);
    }
    return () => { if (loopAnim) loopAnim.stop(); };
  }, [isListening]);

  useSpeechRecognitionEvent('start', () => setIsListening(true));
  useSpeechRecognitionEvent('end', () => setIsListening(false));
  useSpeechRecognitionEvent('error', (event) => {
    setIsListening(false);
    if (event.error === 'client' || event.error === 'network') Alert.alert("Hardware Limitation", "Hindi kumokonekta ang Speech Engine.");
  });
  useSpeechRecognitionEvent('result', (event) => {
    if (event.results && event.results.length > 0) {
      const transcript = event.results[0]?.transcript;
      if (transcript) {
        const space = originalTextRef.current.length > 0 && !originalTextRef.current.endsWith(' ') ? ' ' : '';
        setInputText(originalTextRef.current + space + transcript);
      }
    }
  });

  const openMicModal = async () => {
    Keyboard.dismiss();
    originalTextRef.current = inputText;
    setIsMicModalVisible(true);
    setTimeout(async () => {
      try {
        const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!permission || !permission.granted) {
          Alert.alert("Mic Permission", "Kailangan payagan ang microphone access.");
          setIsMicModalVisible(false);
          return;
        }
        await ExpoSpeechRecognitionModule.start({ lang: 'fil-PH', interimResults: true });
      } catch (e: any) {
        setIsListening(false);
        Alert.alert("Hardware Limitation", e.message || "Bumagsak ang Speech Module.", [{ text: "OK", onPress: () => setIsMicModalVisible(false) }]);
      }
    }, 400);
  };

  const closeMicModal = () => {
    try { ExpoSpeechRecognitionModule.stop(); } catch (e) { }
    setIsListening(false);
    setIsMicModalVisible(false);
  };

  const toggleListeningInModal = async () => {
    try {
      if (isListening) ExpoSpeechRecognitionModule.stop();
      else await ExpoSpeechRecognitionModule.start({ lang: 'fil-PH', interimResults: true });
    } catch (error) { setIsListening(false); }
  };

  const handleSendFromMic = () => {
    closeMicModal();
    setTimeout(() => { sendMessage(inputText); }, 400);
  };

  useEffect(() => { isMounted.current = true; return () => { isMounted.current = false; }; }, []);

  useEffect(() => {
    const initChat = async () => {
      try {
        const storedHistory = await AsyncStorage.getItem('@lex_chat_history');
        if (storedHistory) {
          const parsed = JSON.parse(storedHistory);
          if (parsed && parsed.length > 0) {
            parsed.forEach((m: Message) => animatedMessageIds.current.add(m.id));
            setMessages(parsed);
          }
        }
      } catch (error) { console.error("History load error:", error); }
      finally { setIsChatLoaded(true); }
    };
    initChat();
  }, []);

  useEffect(() => {
    if (isChatLoaded) {
      const incomingFile = route?.params?.attachedFile;
      const incomingPrompt = route?.params?.initialPrompt;
      if (incomingFile) setAttachedFile(incomingFile);
      if (route?.params?.suggestedPrompts) setActivePrompts(route.params.suggestedPrompts);
      if (incomingPrompt && !hasAutoSent.current) { hasAutoSent.current = true; setInputText(incomingPrompt); }
    }
  }, [isChatLoaded, route?.params?.attachedFile, route?.params?.initialPrompt]);

  const scrollToBottom = () => { setTimeout(() => { flatListRef.current?.scrollToEnd({ animated: true }); }, 100); };
  useEffect(() => { scrollToBottom(); }, [messages, isLoading]);
  useEffect(() => {
    if (Platform.OS === 'android') {
      const show = Keyboard.addListener('keyboardDidShow', (e) => { setKeyboardOffset(e.endCoordinates.height); scrollToBottom(); });
      const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOffset(0));
      return () => { show.remove(); hide.remove(); };
    } else {
      const show = Keyboard.addListener('keyboardDidShow', scrollToBottom);
      return () => show.remove();
    }
  }, []);

  const confirmClearChat = async () => {
    setClearModalVisible(false);
    animatedMessageIds.current = new Set(['1']);
    setMessages([DEFAULT_WELCOME_MSG]);
    setAttachedFile(null);
    setReplyingTo(null);
    await AsyncStorage.setItem('@lex_chat_history', JSON.stringify([DEFAULT_WELCOME_MSG]));
  };

  const handleReplyMessage = (msg: Message) => { if (msg.id === '1') return; setReplyingTo(msg); };
  const openMessageOptions = (msg: Message) => { setSelectedMessage(msg); setOptionsModalVisible(true); };

  const confirmUnsend = async () => {
    if (!selectedMessage) return;
    const msgId = selectedMessage.id;
    setOptionsModalVisible(false); setSelectedMessage(null);
    const index = messages.findIndex(m => m.id === msgId);
    if (index === -1) return;
    let updatedMsgs = [...messages];
    if (messages[index + 1] && messages[index + 1].sender === 'ai') updatedMsgs.splice(index, 2);
    else updatedMsgs.splice(index, 1);
    setMessages(updatedMsgs);
    await AsyncStorage.setItem('@lex_chat_history', JSON.stringify(updatedMsgs));
  };

  const handleRegenerate = async (aiMsgId: string) => {
    const index = messages.findIndex(m => m.id === aiMsgId);
    if (index === -1 || messages[index].sender !== 'ai') return;
    const previousUserMsg = messages[index - 1];
    if (!previousUserMsg || previousUserMsg.sender !== 'user') return;
    const filteredMsgs = messages.filter(m => m.id !== aiMsgId);
    setMessages(filteredMsgs);
    await sendMessage(previousUserMsg.text, previousUserMsg.hiddenData, previousUserMsg.attachedFileName, filteredMsgs);
  };

  const sendMessage = async (overrideText?: string, hiddenDataOverride?: string, fileNameOverride?: string, customHistoryArray?: Message[]) => {
    const actualText = typeof overrideText === 'string' ? overrideText : inputText;
    const userText = actualText.trim();
    if (!userText && !attachedFile && !hiddenDataOverride) return;

    try { if (isListening) ExpoSpeechRecognitionModule.stop(); } catch (e) { }

    const baseHistory = customHistoryArray || messages;
    const recentHistory = baseHistory.filter(m => m.id !== '1').slice(-6).map(m => {
      let contentStr = m.text;
      if (m.hiddenData) contentStr = `[PREVIOUSLY ATTACHED DOCUMENT: ${m.attachedFileName}]\n${m.hiddenData}\n\nUSER SAID: ${m.text}`;
      return { role: m.sender, content: contentStr };
    });

    const finalFileName = fileNameOverride || (attachedFile ? attachedFile.name : undefined);
    const finalHiddenData = hiddenDataOverride || (attachedFile ? attachedFile.data : undefined);

    let payloadText = finalHiddenData
      ? `[ATTACHED DOCUMENT CONTEXT: ${finalFileName}]\n\n${finalHiddenData}\n\nCURRENT USER QUESTION: ${userText || "Pakisuri ito."}`
      : `CURRENT USER QUESTION: ${userText}`;

    if (replyingTo) payloadText = `[USER IS REPLYING TO THIS PAST MESSAGE: "${replyingTo.text}"]\n\n` + payloadText;

    const newUserMsg: Message = { id: Date.now().toString(), text: userText || "Nagpadala ng dokumento.", sender: 'user', attachedFileName: finalFileName, hiddenData: finalHiddenData };

    let updatedMessages = [...baseHistory];
    if (!overrideText || customHistoryArray) {
      updatedMessages = [...baseHistory, newUserMsg];
      setMessages(updatedMessages);
      await AsyncStorage.setItem('@lex_chat_history', JSON.stringify(updatedMessages));
    }

    setInputText(''); setAttachedFile(null); setReplyingTo(null); setIsLoading(true); Keyboard.dismiss();

    try {
      const data = await postEndpoint('/chat', { message: payloadText, history: recentHistory });

      if (data.status === 'success') {
        // 🚀 FIX: Ensure we get the reply string and trim any extra quotes
        const replyText = (data.reply || "No reply from AI.").trim();
        const aiMsg: Message = { id: Date.now().toString(), text: replyText, sender: 'ai' };

        const storedHistoryStr = await AsyncStorage.getItem('@lex_chat_history');
        const latestHistory = storedHistoryStr ? JSON.parse(storedHistoryStr) : updatedMessages;
        const finalHistory = [...latestHistory, aiMsg];
        await AsyncStorage.setItem('@lex_chat_history', JSON.stringify(finalHistory));
        if (isMounted.current) setMessages(finalHistory);
      } else {
        throw new Error(data.message || 'Failed');
      }
    } catch (error) {
      const storedHistoryStr = await AsyncStorage.getItem('@lex_chat_history');
      const latestHistory = storedHistoryStr ? JSON.parse(storedHistoryStr) : updatedMessages;
      const errorMsg: Message = { id: Date.now().toString(), text: 'Patawad, hindi ako maka-konekta sa server. Subukan ulit.', sender: 'ai', isError: true };
      const finalHistory = [...latestHistory, errorMsg];
      await AsyncStorage.setItem('@lex_chat_history', JSON.stringify(finalHistory));
      if (isMounted.current) setMessages(finalHistory);
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  };

  const renderMessage = ({ item, index }: { item: Message, index: number }) => {
    const isUser = item.sender === 'user';
    const isLastMsg = index === messages.length - 1;
    return (
      <SwipeableMessage
        item={item} index={index} isUser={isUser} isLastMsg={isLastMsg} isLoading={isLoading}
        onReply={(msg: Message) => setReplyingTo(msg)}
        onOptions={(msg: Message) => { setSelectedMessage(msg); setOptionsModalVisible(true); }}
        onRegenerate={handleRegenerate}
        shouldAnimate={!isUser && !animatedMessageIds.current.has(item.id)}
        onTypingComplete={(id: string) => animatedMessageIds.current.add(id)}
      />
    );
  };

  const chatContent = (
    <>
      <FlatList
        ref={flatListRef} data={messages} keyExtractor={(item) => item.id} renderItem={renderMessage}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10, flexGrow: 1 }}
        showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        onContentSizeChange={scrollToBottom} onLayout={scrollToBottom}
        ListFooterComponent={
          isLoading ? (
            <View style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', width: '100%', justifyContent: 'flex-start' }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(129, 140, 248, 0.15)', justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
                  <Ionicons name="sparkles" size={14} color={COLORS.primaryLight} />
                </View>
                <View style={[uiStyles.bubble, uiStyles.aiBubble, { paddingVertical: 14, paddingHorizontal: 18 }]}><TypingIndicator /></View>
              </View>
            </View>
          ) : null
        }
      />

      <View style={{ paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 25 : 15, backgroundColor: COLORS.background, borderTopWidth: 1, borderTopColor: '#1E293B' }}>
        {messages.length === 1 && !isLoading && (
          <View style={{ marginBottom: 12 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
              {activePrompts.map((prompt, idx) => (
                <TouchableOpacity key={idx} style={uiStyles.suggestionChip} onPress={() => setInputText(prompt)}>
                  <Text style={uiStyles.suggestionText}>{prompt}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {replyingTo && (
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background, borderLeftWidth: 3, borderLeftColor: COLORS.primaryLight, marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.primaryLight, fontSize: 11, fontWeight: 'bold', marginBottom: 2 }}>Replying to {replyingTo.sender === 'ai' ? 'Lex-Simple' : 'Yourself'}</Text>
              <Text style={{ color: '#94A3B8', fontSize: 12, fontStyle: 'italic' }} numberOfLines={1}>{replyingTo.text}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyingTo(null)} style={{ padding: 4 }}><Ionicons name="close-circle" size={20} color="#94A3B8" /></TouchableOpacity>
          </View>
        )}

        {attachedFile && (
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', borderWidth: 1, borderColor: COLORS.primaryLight, marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 }}>
            <View style={{ backgroundColor: COLORS.primary, padding: 6, borderRadius: 6, marginRight: 8 }}><Ionicons name="document-text" size={14} color="#fff" /></View>
            <Text style={{ flex: 1, color: '#E2E8F0', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{attachedFile.name}</Text>
            <TouchableOpacity onPress={() => setAttachedFile(null)} style={{ padding: 4, marginLeft: 5 }}><Ionicons name="close-circle" size={20} color="#94A3B8" /></TouchableOpacity>
          </View>
        )}

        <View style={{ paddingHorizontal: 16 }}>
          <View style={uiStyles.inputBox}>
            <TextInput
              style={uiStyles.textInput}
              placeholder={attachedFile ? "Magtanong tungkol sa doc..." : "Mag-type..."}
              placeholderTextColor="#64748B"
              value={inputText} onChangeText={setInputText} multiline maxLength={500} onFocus={scrollToBottom}
            />
            <TouchableOpacity style={{ padding: 8, marginRight: 2 }} onPress={openMicModal}>
              <Ionicons name="mic-outline" size={22} color="#94A3B8" />
            </TouchableOpacity>
            <TouchableOpacity style={[uiStyles.sendBtn, (!inputText.trim() && !attachedFile || isLoading) && uiStyles.sendBtnDisabled]} onPress={() => sendMessage()} disabled={(!inputText.trim() && !attachedFile) || isLoading}>
              <Ionicons name="send" size={18} color={(inputText.trim() || attachedFile) && !isLoading ? '#fff' : '#64748B'} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Modal visible={isMicModalVisible} transparent={true} animationType="fade" onRequestClose={closeMicModal}>
        <View style={uiStyles.modalBackdrop}>
          <View style={uiStyles.micModalContent}>
            <Text style={uiStyles.micModalTitle}>{isListening ? "Nakikinig..." : "I-tap ang mic para magsalita"}</Text>
            <Text style={uiStyles.micModalTranscript} numberOfLines={3}>
              {inputText.replace(originalTextRef.current, '').trim() || (isListening ? "..." : "Naka-pause.")}
            </Text>
            <TouchableOpacity onPress={toggleListeningInModal} activeOpacity={0.8}>
              <Animated.View style={{ transform: [{ scale: micScaleAnim }] }}>
                <View style={[uiStyles.bigMicIcon, isListening ? uiStyles.micActiveBg : uiStyles.micInactiveBg]}>
                  <Ionicons name={isListening ? "mic" : "mic-off-outline"} size={36} color="#fff" />
                </View>
              </Animated.View>
            </TouchableOpacity>
            <View style={uiStyles.micModalActions}>
              <TouchableOpacity style={uiStyles.micModalCancelBtn} onPress={closeMicModal}><Text style={uiStyles.micModalBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[uiStyles.micModalSendBtn, !inputText.trim() && { opacity: 0.5 }]} onPress={handleSendFromMic} disabled={!inputText.trim()}><Text style={uiStyles.micModalBtnText}>Send Now</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={optionsModalVisible} transparent={true} animationType="fade" onRequestClose={() => setOptionsModalVisible(false)}>
        <TouchableOpacity style={uiStyles.modalBackdrop} activeOpacity={1} onPress={() => setOptionsModalVisible(false)}>
          <TouchableWithoutFeedback>
            <View style={uiStyles.modalContent}>
              <Text style={uiStyles.modalTitle}>Message Options</Text>
              <TouchableOpacity style={uiStyles.modalActionBtn} onPress={() => { setOptionsModalVisible(false); handleReplyMessage(selectedMessage!); }}>
                <Ionicons name="arrow-undo" size={20} color={COLORS.primaryLight} style={{ marginRight: 12 }} /><Text style={uiStyles.modalActionText}>Reply to Message</Text>
              </TouchableOpacity>
              {selectedMessage?.sender === 'user' && (
                <TouchableOpacity style={[uiStyles.modalActionBtn, { borderTopWidth: 1, borderTopColor: '#334155' }]} onPress={confirmUnsend}>
                  <Ionicons name="trash" size={20} color={COLORS.danger} style={{ marginRight: 12 }} /><Text style={[uiStyles.modalActionText, { color: COLORS.danger }]}>Unsend Message</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      <Modal visible={clearModalVisible} transparent={true} animationType="fade" onRequestClose={() => setClearModalVisible(false)}>
        <TouchableOpacity style={uiStyles.modalBackdrop} activeOpacity={1} onPress={() => setClearModalVisible(false)}>
          <TouchableWithoutFeedback>
            <View style={uiStyles.modalContent}>
              <View style={{ alignItems: 'center', marginBottom: 15 }}><Ionicons name="trash" size={28} color={COLORS.danger} /><Text style={uiStyles.modalTitle}>Clear Conversation</Text></View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={[uiStyles.modalBtn, { backgroundColor: '#334155' }]} onPress={() => setClearModalVisible(false)}><Text style={{ color: '#fff', fontWeight: '600' }}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={[uiStyles.modalBtn, { backgroundColor: COLORS.danger }]} onPress={confirmClearChat}><Text style={{ color: '#fff', fontWeight: '600' }}>Clear Chat</Text></TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>
    </>
  );

  return (
    <ScreenLayout title="Ask AI" noPadding={true} rightIcon="trash-outline" onRightPress={() => setClearModalVisible(true)}>
      {Platform.OS === 'ios' ? <KeyboardAvoidingView style={{ flex: 1, backgroundColor: COLORS.background }} behavior="padding" keyboardVerticalOffset={90}>{chatContent}</KeyboardAvoidingView> : <View style={[{ flex: 1, backgroundColor: COLORS.background }, { paddingBottom: keyboardOffset }]}>{chatContent}</View>}
    </ScreenLayout>
  );
};

const uiStyles = StyleSheet.create({
  bubble: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12 },
  userBubble: { backgroundColor: COLORS.primary, borderTopRightRadius: 2, borderBottomRightRadius: 2 },
  aiBubble: { backgroundColor: '#1E1E2E', borderWidth: 1, borderColor: '#334155', borderTopLeftRadius: 2, borderBottomLeftRadius: 2 },
  errorBubble: { borderColor: COLORS.danger, backgroundColor: 'rgba(239, 68, 68, 0.1)' },
  messageText: { fontSize: 15, lineHeight: 22 },
  userText: { color: '#ffffff' },
  aiText: { color: '#E2E8F0' },
  suggestionChip: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  suggestionText: { color: '#CBD5E1', fontSize: 13 },
  inputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E1E2E', borderWidth: 1, borderColor: '#334155', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, minHeight: 48 },
  textInput: { flex: 1, color: '#fff', fontSize: 15, maxHeight: 120, paddingTop: 0, paddingBottom: 0 },
  sendBtn: { backgroundColor: COLORS.primary, width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  sendBtnDisabled: { backgroundColor: '#1E293B' },

  micModalContent: { backgroundColor: '#1E293B', borderRadius: 24, width: '85%', padding: 25, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  micModalTitle: { color: COLORS.primaryLight, fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  micModalTranscript: { color: '#fff', fontSize: 16, textAlign: 'center', marginBottom: 25, minHeight: 60, fontStyle: 'italic' },
  bigMicIcon: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', marginBottom: 25 },
  micActiveBg: { backgroundColor: COLORS.danger },
  micInactiveBg: { backgroundColor: '#334155' },
  micModalActions: { flexDirection: 'row', gap: 15, width: '100%' },
  micModalCancelBtn: { flex: 1, backgroundColor: '#334155', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  micModalSendBtn: { flex: 1, backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  micModalBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1E293B', borderRadius: 16, width: '100%', padding: 20, borderWidth: 1, borderColor: '#334155' },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  modalActionBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15 },
  modalActionText: { color: '#E2E8F0', fontSize: 15, fontWeight: '500' },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' }
});