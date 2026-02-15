import 'environment.dart';

class ProductionEnv extends BaseEnvironment {
  @override
  String get apiBaseUrl => "https://silica-erp-production.up.railway.app";

  @override
  bool get isProduction => true;
}
