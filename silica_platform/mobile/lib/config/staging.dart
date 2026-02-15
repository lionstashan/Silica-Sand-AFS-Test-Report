import 'environment.dart';

class StagingEnv extends BaseEnvironment {
  @override
  String get apiBaseUrl => "http://10.0.2.2:8080";

  @override
  bool get isProduction => false;
}
