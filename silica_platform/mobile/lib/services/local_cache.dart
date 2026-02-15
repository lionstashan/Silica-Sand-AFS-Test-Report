import 'package:shared_preferences/shared_preferences.dart';

class LocalCache {
  static Future<void> setString(String key, String value) async {
    final sp = await SharedPreferences.getInstance();
    await sp.setString(key, value);
  }

  static Future<String?> getString(String key) async {
    final sp = await SharedPreferences.getInstance();
    return sp.getString(key);
  }

  static Future<void> addToQueue(String key, Map<String, dynamic> item) async {
    final sp = await SharedPreferences.getInstance();
    final list = sp.getStringList(key) ?? [];
    list.add(item.toString());
    await sp.setStringList(key, list);
  }

  static Future<List<String>> getQueue(String key) async {
    final sp = await SharedPreferences.getInstance();
    return sp.getStringList(key) ?? [];
  }

  static Future<void> clearQueue(String key) async {
    final sp = await SharedPreferences.getInstance();
    await sp.remove(key);
  }
}
