import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../models/user_roles.dart';
import '../services/messaging_service.dart';

class UserProvider extends ChangeNotifier {
  User? user;
  UserRoles roles = UserRoles([]);
  String? idToken;
  bool loading = false;

  Future<void> refresh() async {
    loading = true;
    notifyListeners();
    final u = FirebaseAuth.instance.currentUser;
    user = u;
    if (u != null) {
      final tokenResult = await u.getIdTokenResult(true);
      idToken = tokenResult.token;
      final claims = tokenResult.claims ?? {};
      final r = (claims['roles'] as List?)?.map((e) => e.toString()).toList() ?? [];
      roles = UserRoles(r);
      await MessagingService().initAndRegister(roles.roles);
    } else {
      idToken = null;
      roles = UserRoles([]);
    }
    loading = false;
    notifyListeners();
  }

  bool hasRole(String role) => roles.has(role);
}
