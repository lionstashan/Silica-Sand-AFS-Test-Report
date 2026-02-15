import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:image_picker/image_picker.dart';

class TicketDetailScreen extends StatefulWidget {
  final DocumentReference<Map<String, dynamic>> ref;
  const TicketDetailScreen({super.key, required this.ref});

  @override
  State<TicketDetailScreen> createState() => _TicketDetailScreenState();
}

class _TicketDetailScreenState extends State<TicketDetailScreen> {
  String? _selectedDowntimeReason;
  final _reasons = const [
    'Mechanical Failure',
    'Electrical Issue',
    'Operator Unavailable',
    'Weather',
    'Road Block',
    'Other'
  ];

  Future<void> _updateStatus(String nextStatus) async {
    final data = {
      'status': nextStatus,
      'updatedBy': FirebaseAuth.instance.currentUser?.uid,
      'updatedAt': FieldValue.serverTimestamp(),
    };
    if (nextStatus == 'Downtime' && _selectedDowntimeReason != null) {
      data['downtimeReasons'] = FieldValue.arrayUnion([_selectedDowntimeReason]);
    }
    await widget.ref.set(data, SetOptions(merge: true));
  }

  Future<void> _addPhoto() async {
    final picker = ImagePicker();
    final img = await picker.pickImage(source: ImageSource.camera, imageQuality: 70);
    if (img == null) return;
    await widget.ref.collection('photos').add({
      'ticketId': widget.ref.id,
      'localPath': img.path,
      'storagePath': null,
      'by': FirebaseAuth.instance.currentUser?.uid,
      'caption': null,
      'uploadedAt': null,
      'createdAt': FieldValue.serverTimestamp(),
    });
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Photo queued for upload')));
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: widget.ref.snapshots(),
      builder: (context, snap) {
        if (!snap.hasData) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        final t = snap.data!.data() ?? {};
        final status = t['status'] as String? ?? 'Open';
        return Scaffold(
          appBar: AppBar(title: Text('Ticket ${widget.ref.id}')),
          body: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Type: ${t['type'] ?? ''}', style: const TextStyle(fontSize: 18)),
                const SizedBox(height: 8),
                Text('Status: $status'),
                const SizedBox(height: 16),
                if (status == 'Downtime' || status == 'Open' || status == 'In-Progress') ...[
                  DropdownButtonFormField<String>(
                    value: _selectedDowntimeReason,
                    items: _reasons.map((r) => DropdownMenuItem(value: r, child: Text(r))).toList(),
                    onChanged: (v) => setState(() => _selectedDowntimeReason = v),
                    decoration: const InputDecoration(labelText: 'Downtime Reason'),
                  ),
                ],
                const SizedBox(height: 12),
                Wrap(spacing: 8, children: [
                  ElevatedButton(onPressed: () => _updateStatus('In-Progress'), child: const Text('Start')),
                  ElevatedButton(onPressed: () => _updateStatus('Downtime'), child: const Text('Downtime')),
                  ElevatedButton(onPressed: () => _updateStatus('Ready-To-Resume'), child: const Text('Resume Ready')),
                  ElevatedButton(onPressed: () => _updateStatus('Completed'), child: const Text('Complete')),
                ]),
                const Divider(height: 24),
                ElevatedButton.icon(onPressed: _addPhoto, icon: const Icon(Icons.camera_alt), label: const Text('Add Photo')),
                const SizedBox(height: 12),
                const Text('Photos:'),
                Expanded(
                  child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                    stream: widget.ref.collection('photos').orderBy('createdAt', descending: true).snapshots(),
                    builder: (context, psnap) {
                      if (!psnap.hasData) return const Center(child: CircularProgressIndicator());
                      final photos = psnap.data!.docs;
                      return ListView.builder(
                        itemCount: photos.length,
                        itemBuilder: (context, i) {
                          final p = photos[i].data();
                          final status = p['storagePath'] == null ? 'Queued' : 'Uploaded';
                          return ListTile(
                            title: Text(p['caption'] ?? ''),
                            subtitle: Text(status),
                          );
                        },
                      );
                    },
                  ),
                )
              ],
            ),
          ),
        );
      },
    );
  }
}
