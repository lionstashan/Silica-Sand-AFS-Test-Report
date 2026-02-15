import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:provider/provider.dart';
import 'package:flutter/foundation.dart';
import 'app/app.dart';
import 'providers/user_provider.dart';
import 'config/environment.dart';
import 'firebase_options.dart';
import 'config/production.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Use production API when running on web (localhost cannot reach 10.0.2.2)
  if (kIsWeb) {
    Env.setEnvironment(ProductionEnv());
  }
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
  } catch (e) {
    // ignore: avoid_print
    print('Firebase init error: $e');
  }
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => UserProvider()),
      ],
      child: const App(),
    ),
  );
}
