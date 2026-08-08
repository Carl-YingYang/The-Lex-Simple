import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../theme/globalStyles';
import { useBackgroundProcess } from '../context/BackgroundProcessContext';
import { useTheme } from '../theme/ThemeContext';

export default function FloatingProcessIndicator() {
    const { isProcessing, processRoute } = useBackgroundProcess();
    const { colors: T } = useTheme();
    const navigation = useNavigation<any>();
    const spinValue = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (isProcessing) {
            Animated.loop(
                Animated.timing(spinValue, {
                    toValue: 1,
                    duration: 1000,
                    easing: Easing.linear,
                    useNativeDriver: true,
                })
            ).start();
        } else {
            spinValue.stopAnimation();
            spinValue.setValue(0);
        }
    }, [isProcessing]);

    if (!isProcessing) return null;

    const spin = spinValue.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    const handlePress = () => {
        if (processRoute) {
            navigation.navigate(processRoute);
        }
    };

    return (
        // 🚀 FIXED: Hindi na full width ang wrapper para hindi makaharang ng touches
        <View style={styles.wrapper}>
            <TouchableOpacity onPress={handlePress} activeOpacity={0.8}>
                <View style={[styles.pill, { backgroundColor: T.card, borderColor: T.border }]}>
                    <Animated.View style={{ transform: [{ rotate: spin }] }}>
                        <Ionicons name="sync-circle" size={20} color={COLORS.primaryLight} />
                    </Animated.View>
                    <Text style={[styles.text, { color: T.text }]}>Processing...</Text>
                    <Ionicons name="chevron-forward" size={16} color={COLORS.primaryLight} style={{ marginLeft: 6 }} />
                </View>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        position: 'absolute',
        top: 80,
        alignSelf: 'center', // 🚀 Naka-center lang siya, hindi na sumasakop sa buong screen
        zIndex: 9999,
        elevation: 10,
    },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 2 },
    },
    text: {
        marginLeft: 8,
        fontSize: 13,
        fontWeight: 'bold',
    }
});