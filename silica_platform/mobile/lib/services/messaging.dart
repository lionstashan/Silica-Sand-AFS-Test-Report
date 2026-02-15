import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'dart:io' show Platform;

Future<void> initMessaging() async {
  final messaging = FirebaseMessaging.instance;

  // Request user permission for notifications (iOS, Android 13+)
  await messaging.requestPermission(alert: true, badge: true, sound: true);

  // Ensure we have a logged-in user
  final user = FirebaseAuth.instance.currentUser;

  // Helper to save token deterministically to avoid duplicates
  Future<void> saveToken(String token) async {
    if (user == null) return;
    final doc = FirebaseFirestore.instance.collection('deviceTokens').doc(token);
    await doc.set({
      'uid': user.uid,
      'token': token,
      'platform': Platform.operatingSystem,
      'ts': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  // Initial token fetch
  final token = await messaging.getToken();
  if (token != null) {
    await saveToken(token);
  }

  // Listen for token refreshes and persist
  messaging.onTokenRefresh.listen((newToken) async {
    await saveToken(newToken);
  });

  // Retrieve custom role claims and subscribe to FCM topics
  // Force refresh in case claims were recently updated
  await user?.getIdToken(true);
  final idToken = await user?.getIdTokenResult();
  final roles = (idToken?.claims['roles'] as List?)?.cast<String>() ?? [];
  for (final role in roles) {
    await messaging.subscribeToTopic(role);
  }
}
