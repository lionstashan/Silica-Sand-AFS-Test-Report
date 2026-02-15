import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
import 'package:flutter/foundation.dart';
import 'dart:html' as html;
import '../../services/auth_service.dart';
import '../../providers/user_provider.dart';
import '../../routes.dart';
import 'otp_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phoneCtl = TextEditingController();
  bool _loading = false;
  ConfirmationResult? _confirmation;

  @override
  void initState() {
    super.initState();
    if (kIsWeb) {
      html.document.getElementById('recaptcha-container') ??
          html.document.body!.append(html.DivElement()..id = 'recaptcha-container');
    }
  }

  Future<void> _sendOtp() async {
    final raw = _phoneCtl.text.trim();
    final phone = raw.startsWith('+') ? raw : '+91$raw';
    setState(() => _loading = true);
    try {
      if (kIsWeb) {
        final verifier = RecaptchaVerifier(
          auth: FirebaseAuthPlatform.instance,
          container: 'recaptcha-container',
        );
        final confirmation = await FirebaseAuth.instance.signInWithPhoneNumber(phone, verifier);
        setState(() => _confirmation = confirmation);
        if (!mounted) return;
        await Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => OtpScreen(confirmation: confirmation),
        ));
      } else {
        final verificationId = await AuthService().sendOtp(phone);
        if (!mounted) return;
        await Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => OtpScreen(verificationId: verificationId is String ? verificationId : null),
        ));
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('OTP sent')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Login')),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          children: [
            TextField(
              controller: _phoneCtl,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Phone Number'),
            ),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: _loading ? null : _sendOtp,
              child: _loading ? const CircularProgressIndicator() : const Text('Send OTP'),
            ),
          ],
        ),
      ),
    );
  }
}
