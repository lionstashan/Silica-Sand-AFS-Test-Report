import 'package:flutter/foundation.dart';
import 'staging.dart';
import 'production.dart';

abstract class BaseEnvironment {
  String get apiBaseUrl;
  bool get isProduction;
}

class Env {
  static BaseEnvironment _env = kReleaseMode ? ProductionEnv() : StagingEnv();

  static void setEnvironment(BaseEnvironment env) {
    _env = env;
  }

  static String get apiBaseUrl => _env.apiBaseUrl;
  static bool get isProduction => _env.isProduction;
}
