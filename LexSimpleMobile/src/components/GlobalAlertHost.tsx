import React, { useEffect, useState } from 'react';

import CustomAlert, {
    type AlertButton,
    type AlertType,
} from './CustomAlert';

// GLOBAL ALERT HOST VERSION: 1.0.0
// Iisang CustomAlert instance para sa BUONG app. Kahit saang sulok —
// screen, context, o service — tawagin lang ang showGlobalAlert() at
// lalabas ang parehong istilo ng popup (themed, purple spec).
//
// Bakit may global host: dating halo ang popups — ang ibang screens ay
// gumagamit ng useCustomAlert() hook, pero ang BackgroundProcessContext
// (walang UI tree) ay naka-native Alert.alert. Ngayon, iisang itsura na
// ang lahat.
//
// Paggamit (kahit saan, kahit walang React context):
//   import { showGlobalAlert } from '../components/GlobalAlertHost';
//   showGlobalAlert('Pamagat', 'Paliwanag.', 'error');
//   showGlobalAlert('Pamagat', 'Paliwanag.', 'warning', [
//       { text: 'Kanselahin', style: 'cancel' },
//       { text: 'Tuloy', onPress: () => {} },
//   ]);
//
// Mount-once lang sa AppNavigator, sa LOOB ng ThemeProvider para
// naka-theme ito sa light/dark.

interface GlobalAlertState {
    visible: boolean;
    title: string;
    message: string;
    type: AlertType;
    buttons: AlertButton[];
}

const INITIAL_STATE: GlobalAlertState = {
    visible: false,
    title: '',
    message: '',
    type: 'info',
    buttons: [],
};

// External store — maliit at sync. Isang listener set lang; ang host ang
// tanging React component na nag-subscribe.
let alertState: GlobalAlertState = INITIAL_STATE;
const listeners = new Set<(state: GlobalAlertState) => void>();

const emit = (): void => {
    listeners.forEach((listener) => listener(alertState));
};

export const showGlobalAlert = (
    title: string,
    message: string,
    type: AlertType = 'info',
    buttons: AlertButton[] = []
): void => {
    alertState = {
        visible: true,
        title,
        message,
        type,
        buttons,
    };
    emit();
};

export const hideGlobalAlert = (): void => {
    alertState = {
        ...alertState,
        visible: false,
    };
    emit();
};

export default function GlobalAlertHost() {
    const [state, setState] = useState<GlobalAlertState>(alertState);

    useEffect(() => {
        const listener = (next: GlobalAlertState): void => {
            setState(next);
        };

        listeners.add(listener);

        return () => {
            listeners.delete(listener);
        };
    }, []);

    return (
        <CustomAlert
            visible={state.visible}
            title={state.title}
            message={state.message}
            type={state.type}
            buttons={state.buttons}
            onClose={hideGlobalAlert}
        />
    );
}