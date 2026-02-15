import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/user_provider.dart';

class RoleGuard extends StatelessWidget {
  final List<String> roles;
  final Widget child;
  const RoleGuard({super.key, required this.roles, required this.child});

  @override
  Widget build(BuildContext context) {
    return Consumer<UserProvider>(
      builder: (context, user, _) {
        final allowed = roles.any((r) => user.hasRole(r));
        return allowed ? child : const SizedBox.shrink();
      },
    );
  }
}
