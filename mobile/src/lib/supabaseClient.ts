import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = "https://zxoavlkrqktrikebegrl.supabase.co";

const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4b2F2bGtycWt0cmlrZWJlZ3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwMjI5MzIsImV4cCI6MjA5NzU5ODkzMn0.XHi-BOcF6Cj1k2O_eYmqEKkJ6IAHBaV0A4Ib-0as360";
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
