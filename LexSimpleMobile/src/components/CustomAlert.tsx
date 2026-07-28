import React, { useState } from 'react';
import { 
  Modal, 
  View, 
  Text, 
  TouchableOpacity, 
  TouchableWithoutFeedback, 
  Dimensions, 
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { globalStyles, COLORS } from '../theme/globalStyles';

const { width } = Dimensions.get('window');

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
    <Modal transparent={true} visible={visible} animationType="fade" onRequestClose={type === 'loading' ? () => {} : onClose} statusBarTranslucent>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={globalStyles.customAlert_overlay} activeOpacity={1} onPress={type === 'loading' ? undefined : onClose}>
          <TouchableWithoutFeedback>
            <View style={globalStyles.customAlert_box}>
              
              <View style={[globalStyles.customAlert_iconWrapper, { backgroundColor: config.bg }]}>
                {type === 'loading' ? (
                   <ActivityIndicator size="small" color={config.color} />
                ) : (
                   <Ionicons name={config.icon as any} size={28} color={config.color} />
                )}
              </View>

              <Text style={globalStyles.customAlert_title}>{title}</Text>
              
              <Text style={type === 'loading' ? [globalStyles.customAlert_message, { marginBottom: 0 }] : globalStyles.customAlert_message}>
                {message}
              </Text>

              {type !== 'loading' && (
                <View style={globalStyles.customAlert_buttonRow}>
                  {actionButtons.map((btn, index) => {
                    const isCancel = btn.style === 'cancel';
                    const isDestructive = btn.style === 'destructive';

                    return (
                      <TouchableOpacity
                        key={index}
                        style={[
                          globalStyles.customAlert_button,
                          isCancel ? globalStyles.customAlert_cancelButton : isDestructive ? globalStyles.customAlert_destructiveButton : globalStyles.customAlert_primaryButton,
                          actionButtons.length > 1 && index > 0 ? { marginLeft: 10 } : {} 
                        ]}
                        onPress={() => {
                          if (btn.onPress) btn.onPress();
                          onClose(); 
                        }}
                      >
                        <Text style={[
                          globalStyles.customAlert_buttonText,
                          isCancel ? globalStyles.customAlert_cancelText : isDestructive ? globalStyles.customAlert_destructiveText : globalStyles.customAlert_primaryText
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