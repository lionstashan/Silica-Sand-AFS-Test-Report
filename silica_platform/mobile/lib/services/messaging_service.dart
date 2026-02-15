import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'api_client.dart';

class MessagingService {
  final FirebaseMessaging _fm = FirebaseMessaging.instance;

  Future<void> initAndRegister(List<String> roles) async {
    await _fm.requestPermission();
    final token = await _fm.getToken();
    if (token != null) {
      await ApiClient.instance.post('/api/notifications/register-token', { 'token': token });
    }
    await _subscribeRoles(roles);
  }

  Future<void> _subscribeRoles(List<String> roles) async {
    final lower = roles.map((r) => r.toLowerCase()).toList();
    for (final role in lower) {
      try { await _fm.subscribeToTopic('role_$role'); } catch (_) {}
    }
    // Always subscribe to user-specific topic
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid != null) {
      try { await _fm.subscribeToTopic('user_$uid'); } catch (_) {}
    }
  }
}
