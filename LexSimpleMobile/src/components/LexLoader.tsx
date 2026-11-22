/*
 * LexLoader.tsx — brand loading component ng LexSimple. (v1.1)
 *
 * Konsepto: "gavel tap" — ang mascot logo (winking gavel) ay
 * magbabayong parang gavel na naghahanda ng hatol habang
 * naglo-load ang app. Kasama ang tatlong yellow accent dots na
 * sumisikat nang sunud-sunod, at ang LEX-SIMPLE wordmark.
 *
 * Pure React Native Animated API — WALANG bagong native dependency,
 * kaya safe sa current SDK at walang dagdag na babaguhin sa build.
 *
 * SAAN ILAGAY ANG COMPONENT:
 *   1. I-search sa src/ folder ang string na "Inihahanda ang saved scans"
 *      (text lang — HUWAG isama ang <LexLoader ... /> sa search, kung
 *      hindi isang comment lang dito sa file ang ma-hihit mo).
 *   2. Sa loob ng loading screen na 'yon, palitan ang lumang logo block
 *      ng:  <LexLoader message="Inihahanda ang saved scans…" />
 *   3. Kung gumagamit ang screen ng sariling container (header, safe
 *      area, atbp.), pwedeng burahin ang `flex: 1` sa styles.root at
 *      gamitin ang LexLoader bilang child — o i-wrap sa <View style={{ flex: 1 }}>.
 *
 * NOTE sa filename: ang asset ay "Lex-Simpe-Logo.png" (may "Simpe"
 * typo mismo sa filename) — huwag i-correct sa require kung ganyan
 * pa rin ang totoong filename sa /assets folder.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    Image,
    ImageSourcePropType,
    StyleSheet,
    Text,
    View,
} from 'react-native';

const BRAND = {
    purple: '#5D18EB',
    yellow: '#E1FF00',
    ink: '#111111',
    cream: '#FFF8E7',
    subText: '#3C3C46',
};

/*
 * v1.1: ang file na ito ay nasa src/components/, kaya DALAWANG
 * ../ ang kailangan para umabot sa root assets folder:
 *   src/components/LexLoader.tsx  →  ../../assets/...
 * (Ang v1.0 na ../assets ay nagre-resolve sa src/assets — mali,
 * doon ang sanhi ng "Unable to resolve module" sa bundle.)
 */
const DEFAULT_LOGO = require('../../assets/Lex-Simpe-Logo.png');

type LexLoaderProps = {
    /** Text sa ilalim ng dots (hal. "Inihahanda ang saved scans…") */
    message?: string;
    /** I-override kung iba ang location/path ng logo asset */
    logoSource?: ImageSourcePropType;
};

export const LexLoader = ({
    message = 'Naghahanda…',
    logoSource = DEFAULT_LOGO,
}: LexLoaderProps): React.ReactElement => {
    const tap = useRef(new Animated.Value(0)).current;
    const dots = useRef(new Animated.Value(0)).current;
    const [logoFailed, setLogoFailed] = useState(false);

    useEffect(() => {
        /*
         * Gavel strike loop:
         * 0 → 0.45  : itaas ang gavel (hinga pataas)
         * 0.45 → 0.72 : TAP pababa (maliit na overshoot, +3deg)
         * 0.72 → 1  : balik sa resting
         * tapos kaunting pahinga bago ulit.
         */
        const gavel = Animated.loop(
            Animated.sequence([
                Animated.timing(tap, {
                    toValue: 1,
                    duration: 430,
                    easing: Easing.out(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.timing(tap, {
                    toValue: 0,
                    duration: 380,
                    easing: Easing.in(Easing.back(1.8)),
                    useNativeDriver: true,
                }),
                Animated.delay(600),
            ])
        );

        const bounce = Animated.loop(
            Animated.timing(dots, {
                toValue: 1,
                duration: 900,
                easing: Easing.linear,
                useNativeDriver: true,
            })
        );

        gavel.start();
        bounce.start();
        return () => {
            gavel.stop();
            bounce.stop();
        };
    }, [tap, dots]);

    const rotate = tap.interpolate({
        inputRange: [0, 0.45, 0.72, 1],
        outputRange: ['2deg', '-9deg', '3deg', '2deg'],
    });

    const lift = tap.interpolate({
        inputRange: [0, 0.45, 0.72, 1],
        outputRange: [0, -10, 4, 0],
    });

    /*
     * v1.1: tinanggal ang explicit `: Animated.AnimatedInterpolation`
     * return types — nangangailangan ito ng type argument sa mga
     * bagong RN type definitions (ts(2314) na nakita sa screenshot mo).
     * Hayaang i-infer na lang ng TypeScript ang interpolation types —
     * version-proof ito sa anumang RN version.
     */
    const dotOpacity = (index: number) => {
        const start = index * 0.22;
        return dots.interpolate({
            inputRange: [start, Math.min(start + 0.35, 1), 1],
            outputRange: [0.4, 1, 0.4],
        });
    };

    const dotLift = (index: number) => {
        const start = index * 0.22;
        return dots.interpolate({
            inputRange: [start, Math.min(start + 0.35, 1), 1],
            outputRange: [0, -7, 0],
        });
    };

    return (
        <View style={styles.root} accessibilityLabel="Naglo-load ang LexSimple">
            <Animated.View
                style={[
                    styles.logoWrap,
                    { transform: [{ rotate }, { translateY: lift }] },
                ]}
            >
                {logoFailed ? (
                    /*
                     * Fallback: hindi na muling magkakaroon ng puting
                     * basag na kahon — kapag hindi nag-load ang logo,
                     * purple monogram card ang ipapakita.
                     */
                    <View style={[styles.logoFrame, styles.fallbackFrame]}>
                        <Text style={styles.fallbackMark}>LS</Text>
                    </View>
                ) : (
                    <Image
                        source={logoSource}
                        style={styles.logoFrame}
                        resizeMode="cover"
                        onError={() => setLogoFailed(true)}
                        accessibilityIgnoresInvertColors
                    />
                )}
            </Animated.View>

            <Text style={styles.wordmark}>LEX-SIMPLE</Text>

            <View style={styles.dotsRow}>
                {[0, 1, 2].map((index) => (
                    <Animated.View
                        key={index}
                        style={[
                            styles.dot,
                            {
                                opacity: dotOpacity(index),
                                transform: [{ translateY: dotLift(index) }],
                            },
                        ]}
                    />
                ))}
            </View>

            {message ? <Text style={styles.message}>{message}</Text> : null}
        </View>
    );
};

const styles = StyleSheet.create({
    root: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 32,
    },
    logoWrap: {
        marginBottom: 20,
    },
    logoFrame: {
        width: 124,
        height: 124,
        borderRadius: 22,
        borderWidth: 2,
        borderColor: BRAND.ink,
        backgroundColor: BRAND.purple,
    },
    fallbackFrame: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    fallbackMark: {
        color: BRAND.cream,
        fontSize: 40,
        fontWeight: '800',
        letterSpacing: 2,
    },
    wordmark: {
        color: BRAND.purple,
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: 6,
        marginBottom: 18,
    },
    dotsRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        height: 18,
        marginBottom: 14,
    },
    dot: {
        width: 10,
        height: 10,
        marginHorizontal: 5,
        borderRadius: 3,
        borderWidth: 1.5,
        borderColor: BRAND.ink,
        backgroundColor: BRAND.yellow,
    },
    message: {
        color: BRAND.subText,
        fontSize: 15,
        fontWeight: '600',
        textAlign: 'center',
    },
});

export default LexLoader; 