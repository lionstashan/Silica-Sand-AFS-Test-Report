import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../services/messaging.dart';
import '../services/photo_queue.dart';

class TicketsListScreen extends StatefulWidget {
  const TicketsListScreen({super.key});

  @override
  State<TicketsListScreen> createState() => _TicketsListScreenState();
}

class _TicketsListScreenState extends State<TicketsListScreen> {
  @override
  void initState() {
    super.initState();
    initMessaging();
    PhotoQueueService().start();
  }

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    final query = FirebaseFirestore.instance
        .collection('tickets')
        .orderBy('createdAt', descending: true)
        .limit(50);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Tickets'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => FirebaseAuth.instance.signOut(),
          )
        ],
      ),
      body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: query.snapshots(includeMetadataChanges: true),
        builder: (context, snap) {
          if (snap.hasError) return Center(child: Text('Error: ${snap.error}'));
          if (!snap.hasData) return const Center(child: CircularProgressIndicator());
          final docs = snap.data!.docs;
          final isFromCache = snap.data!.metadata.isFromCache;
          return Column(
            children: [
              if (isFromCache)
                const ListTile(
                    leading: Icon(Icons.cloud_off),
                    title: Text('Offline data'),
                    subtitle: Text('Pending sync...')),
              Expanded(
                child: ListView.builder(
                  itemCount: docs.length,
                  itemBuilder: (context, i) {
                    final t = docs[i].data();
                    return ListTile(
                      title: Text('${t['type'] ?? 'Ticket'} • ${t['status'] ?? ''}'),
                      subtitle: Text('Mine ${t['mine'] ?? '-'} • Pit ${t['pit'] ?? '-'}'),
                      trailing: Text((t['createdAt'] as Timestamp?)?.toDate().toLocal().toString() ?? ''),
                      onTap: () async {
                        // Navigate to details for richer controls
                        Navigator.of(context).push(MaterialPageRoute(
                          builder: (_) => TicketDetailScreen(ref: docs[i].reference),
                        ));
                      },
                    );
                  },
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  String? _nextStatus(String? s) {
    const flow = [
      'Open',
      'In-Progress',
      'Downtime',
      'Downtime-Fix',
      'Downtime-Fix-Completed',
      'Ready-To-Resume',
      'Completed',
      'Closed'
    ];
    if (s == null) return flow.first;
    final idx = flow.indexOf(s);
    if (idx < 0 || idx + 1 >= flow.length) return null;
    return flow[idx + 1];
  }
}
