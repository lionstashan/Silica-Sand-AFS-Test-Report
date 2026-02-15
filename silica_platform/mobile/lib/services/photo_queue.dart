import 'dart:async';
import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:connectivity_plus/connectivity_plus.dart';

class PhotoQueueService {
  StreamSubscription? _connSub;

  void start() {
    _connSub = Connectivity().onConnectivityChanged.listen((result) {
      if (result != ConnectivityResult.none) {
        _syncPending();
      }
    });
    _syncPending();
  }

  void dispose() {
    _connSub?.cancel();
  }

  Future<void> _syncPending() async {
    final query = FirebaseFirestore.instance
        .collectionGroup('photos')
        .where('localPath', isGreaterThan: '')
        .where('storagePath', isNull: true)
        .limit(10);
    final snap = await query.get(const GetOptions(source: Source.cache));
    for (final d in snap.docs) {
      final data = d.data();
      final localPath = data['localPath'] as String?;
      final ticketId = data['ticketId'] as String?;
      if (localPath == null || ticketId == null) continue;
      try {
        final fileBytes = await _readFileBytes(localPath);
        final name = DateTime.now().millisecondsSinceEpoch.toString();
        final storagePath = 'tickets/$ticketId/$name.jpg';
        final ref = FirebaseStorage.instance.ref(storagePath);
        await ref.putData(fileBytes, SettableMetadata(contentType: 'image/jpeg'));
        await d.reference.update({
          'storagePath': storagePath,
          'uploadedAt': FieldValue.serverTimestamp(),
        });
      } catch (_) {
        // swallow and retry later
      }
    }
  }

  Future<List<int>> _readFileBytes(String path) async {
    // Fallback simple file read; rely on platform assets API via image_picker temp paths
    final file = await Future.microtask(() => File(path));
    return file.readAsBytes();
  }
}
