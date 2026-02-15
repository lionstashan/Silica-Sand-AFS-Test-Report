import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:firebase_auth/firebase_auth.dart';
import '../../config/environment.dart';

class ApiClient {
  ApiClient._();
  static final ApiClient instance = ApiClient._();

  // Base URL derived from environment
  String get baseUrl => Env.apiBaseUrl;

  Future<String?> _token() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return null;
    return await user.getIdToken();
  }

  Future<http.Response> get(String path) async {
    final t = await _token();
    final uri = Uri.parse('$baseUrl$path');
    // ignore: avoid_print
    print("API ENV: ${Env.apiBaseUrl}");
    final res = await http.get(uri, headers: _headers(t));
    _log('GET', uri.toString(), res.statusCode);
    return res;
  }

  Future<http.Response> post(String path, Map<String, dynamic> body) async {
    final t = await _token();
    final uri = Uri.parse('$baseUrl$path');
    // ignore: avoid_print
    print("API ENV: ${Env.apiBaseUrl}");
    final res = await http.post(uri, headers: _headers(t), body: jsonEncode(body));
    _log('POST', uri.toString(), res.statusCode);
    return res;
  }

  Future<http.Response> patch(String path, Map<String, dynamic> body) async {
    final t = await _token();
    final uri = Uri.parse('$baseUrl$path');
    // ignore: avoid_print
    print("API ENV: ${Env.apiBaseUrl}");
    final res = await http.patch(uri, headers: _headers(t), body: jsonEncode(body));
    _log('PATCH', uri.toString(), res.statusCode);
    return res;
  }

  Map<String, String> _headers(String? token) => {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  void _log(String method, String url, int statusCode) {
    // Simple debug print for every request
    // Format: METHOD URL -> STATUS
    // Avoid changing any other logic
    // Note: Consider wiring to a proper logger later
    // ignore: avoid_print
    print('[ApiClient] $method $url -> $statusCode');
  }
}
