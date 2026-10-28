import * as React from 'react';
import { createNavigationContainerRef } from '@react-navigation/native';

type AppRouteParamList = Record<string, object | undefined>;

export const navigationRef = createNavigationContainerRef<AppRouteParamList>();

export function navigate(name: string, params?: any) {
    if (navigationRef.isReady()) {
        navigationRef.navigate(name, params);
    }
}