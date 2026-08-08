import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme/globalStyles';
import { useTheme } from '../theme/ThemeContext';

// 💡 DINAGDAGAN NATIN NG 'loading' TYPE!
export type AlertType = 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  type?: AlertType;
  buttons?: AlertButton[];
  onClose: () => void;
}

export function useCustomAlert() {
  const [config, setConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: AlertType;
    buttons: AlertButton[];
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
    buttons: [],
  });

  const showAlert = (title: string, message: string, type: AlertType = 'info', buttons: AlertButton[] = []) => {
    setConfig({ visible: true, title, message, type, buttons });
  };

  const hideAlert = () => {
    setConfig((prev) => ({ ...prev, visible: false }));
  };

  const AlertRender = () => (
    <CustomAlert
      visible={config.visible}
      title={config.title}
      message={config.message}
      type={config.type}
      buttons={config.buttons}
      onClose={hideAlert}
    />
  );

  return { showAlert, hideAlert, AlertRender };
}

export default function CustomAlert({ visible, title, message, type = 'info', buttons = [], onClose }: CustomAlertProps) {
  const { colors: T } = useTheme(); // 🚀 GLOBAL THEME

  const getAlertConfig = () => {
    switch (type) {
      case 'success': return { icon: 'checkmark-circle', color: COLORS.success, bg: 'rgba(16, 185, 129, 0.15)' };
      case 'error': return { icon: 'close-circle', color: COLORS.danger, bg: 'rgba(239, 68, 68, 0.15)' };
      case 'warning': return { icon: 'warning', color: COLORS.warning, bg: 'rgba(245, 158, 11, 0.15)' };
      case 'loading': return { icon: 'loading', color: COLORS.primaryLight, bg: 'rgba(129, 140, 248, 0.15)' };
      default: return { icon: 'information-circle', color: COLORS.primaryLight, bg: 'rgba(129, 140, 248, 0.15)' };
    }
  };

  const config = getAlertConfig();
  const actionButtons = buttons.length > 0 ? buttons : [{ text: 'OK', onPress: onClose }];

  return (
    <Modal transparent={true} visible={visible} animationType="fade" onRequestClose={type === 'loading' ? () => { } : onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={uiStyles.overlay} activeOpacity={1} onPress={type === 'loading' ? undefined : onClose}>
          <TouchableWithoutFeedback>
            {/* 🚀 SLEEK UI: Solid Theme Background & Sharp Corners */}
            <View style={[uiStyles.box, { backgroundColor: T.card, borderColor: T.border }]}>

              <View style={[uiStyles.iconWrapper, { backgroundColor: config.bg }]}>
                {type === 'loading' ? (
                  <ActivityIndicator size="small" color={config.color} />
                ) : (
                  <Ionicons name={config.icon as any} size={28} color={config.color} />
                )}
              </View>

              <Text style={[uiStyles.title, { color: T.text }]}>{title}</Text>

              <Text style={[uiStyles.message, { color: T.subText }, type === 'loading' && { marginBottom: 0 }]}>
                {message}
              </Text>

              {type !== 'loading' && (
                <View style={uiStyles.buttonRow}>
                  {actionButtons.map((btn, index) => {
                    const isCancel = btn.style === 'cancel';
                    const isDestructive = btn.style === 'destructive';

                    return (
                      <TouchableOpacity
                        key={index}
                        style={[
                          uiStyles.button,
                          isCancel ? [uiStyles.cancelButton, { backgroundColor: T.bg, borderColor: T.border }] :
                            isDestructive ? uiStyles.destructiveButton : uiStyles.primaryButton,
                          actionButtons.length > 1 && index > 0 ? { marginLeft: 10 } : {}
                        ]}
                        onPress={() => {
                          if (btn.onPress) btn.onPress();
                          onClose();
                        }}
                      >
                        <Text style={[
                          uiStyles.buttonText,
                          isCancel ? [uiStyles.cancelText, { color: T.text }] :
                            isDestructive ? uiStyles.destructiveText : uiStyles.primaryText
                        ]}>
                          {btn.text}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// 🎨 SLEEK & SHARP UI STYLES
const uiStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  box: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 12, // Sharp corner
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
  },
  iconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 12, // Sharp corner
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'center',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8, // Sharp corner
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
  },
  primaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  destructiveButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  destructiveText: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: 'bold',
  },
  buttonText: {
    letterSpacing: 0.5,
  }
});