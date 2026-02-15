import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';

class AuthService {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  static ConfirmationResult? _webConfirmation;

  Future<dynamic> sendOtp(String phoneNumber) async {
    if (kIsWeb) {
      try {
        final verifier = RecaptchaVerifier(auth: FirebaseAuthPlatform.instance);
        _webConfirmation = await _auth.signInWithPhoneNumber(phoneNumber, verifier);
        return _webConfirmation;
      } on FirebaseAuthException catch (e) {
        throw e.message ?? 'Phone auth failed';
      } catch (e) {
        rethrow;
      }
    }

    final completer = Completer<String>();
    await _auth.verifyPhoneNumber(
      phoneNumber: phoneNumber,
      verificationCompleted: (credential) async {
        // Auto-retrieval on Android; sign in directly
        try {
          await _auth.signInWithCredential(credential);
          completer.complete('');
        } catch (e) {
          completer.completeError(e);
        }
      },
      verificationFailed: (FirebaseAuthException e) {
        completer.completeError(e.message ?? 'Verification failed');
      },
      codeSent: (String verificationId, int? resendToken) {
        completer.complete(verificationId);
      },
      codeAutoRetrievalTimeout: (String verificationId) {
        // Provide verificationId for manual code entry
        if (!completer.isCompleted) completer.complete(verificationId);
      },
    );
    return completer.future;
  }

  Future<UserCredential> verifyOtp(String verificationId, String smsCode) async {
    if (kIsWeb && _webConfirmation != null) {
      return await _webConfirmation!.confirm(smsCode);
    }
    final credential = PhoneAuthProvider.credential(
      verificationId: verificationId,
      smsCode: smsCode,
    );
    return await _auth.signInWithCredential(credential);
  }

  Future<void> signOut() async {
    await _auth.signOut();
  }
}

class Completer<T> {
  T? _value;
  Object? _error;
  bool _isCompleted = false;
  void complete(T value) { _value = value; _isCompleted = true; }
  void completeError(Object error) { _error = error; _isCompleted = true; }
  bool get isCompleted => _isCompleted;
  Future<T> get future async {
    while (!_isCompleted) {
      await Future.delayed(const Duration(milliseconds: 50));
    }
    if (_error != null) throw _error!;
    return _value as T;
  }
}
