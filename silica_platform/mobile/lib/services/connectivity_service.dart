import 'package:connectivity_plus/connectivity_plus.dart';

class ConnectivityService {
  final Connectivity _conn = Connectivity();

  Stream<ConnectivityResult> get onChange => _conn.onConnectivityChanged;

  Future<bool> isOnline() async {
    final r = await _conn.checkConnectivity();
    return r != ConnectivityResult.none;
  }
}
