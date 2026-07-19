import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';

import App from './App';
import './src/modules/LocationSharingModule';

registerRootComponent(App);