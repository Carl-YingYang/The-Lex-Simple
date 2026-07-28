import React from 'react';
import { View, ScrollView, TouchableOpacity, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, globalStyles } from '../theme/globalStyles';

interface ModalSheetProps {
    title: string;
    iconName: string;
    iconColor: string;
    onClose: () => void;
    children: React.ReactNode;
    maxHeightPercent?: string;
    showsVerticalScrollIndicator?: boolean;
}

export default function ModalSheet({
    title,
    iconName,
    iconColor,
    onClose,
    children,
    maxHeightPercent = '86%',
    showsVerticalScrollIndicator = true,
}: ModalSheetProps) {
    return (
        <View style={globalStyles.result_modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
            <View
                style={[
                    globalStyles.result_modalCenterBox,
                    { maxHeight: maxHeightPercent },
                ]}
            >
                {/* HEADER */}
                <View style={globalStyles.result_modalHeaderArea}>
                    <View style={globalStyles.result_modalHeaderTitleArea}>
                        <Ionicons
                            name={iconName as any}
                            size={20}
                            color={iconColor}
                            style={{ marginRight: 8 }}
                        />
                        <Text style={globalStyles.result_modalTitleText} numberOfLines={1}>
                            {title}
                        </Text>
                    </View>
                    <TouchableOpacity onPress={onClose} style={globalStyles.detailModal_closeBtn}>
                        <Ionicons name="close" size={18} color="white" />
                    </TouchableOpacity>
                </View>

                {/* BODY - Automatically scrollable */}
                <ScrollView
                    style={globalStyles.result_modalBodyArea}
                    showsVerticalScrollIndicator={showsVerticalScrollIndicator}
                >
                    {children}
                </ScrollView>
            </View>
        </View>
    );
}
