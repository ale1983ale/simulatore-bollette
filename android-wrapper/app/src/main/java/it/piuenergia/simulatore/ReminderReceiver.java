package it.piuenergia.simulatore;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class ReminderReceiver extends BroadcastReceiver {
    public static final String CHANNEL = "gestione_energia_appuntamenti";

    @Override public void onReceive(Context context, Intent intent) {
        if ("SNOOZE".equals(intent.getAction())) {
            Intent again = new Intent(context, ReminderReceiver.class);
            String snoozeId = intent.getStringExtra("id");
            again.putExtra("id", snoozeId);
            again.putExtra("title", intent.getStringExtra("title"));
            again.putExtra("detail", intent.getStringExtra("detail"));
            PendingIntent alarm = PendingIntent.getBroadcast(context, snoozeId == null ? 0 : snoozeId.hashCode(),
                again, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            ((AlarmManager) context.getSystemService(Context.ALARM_SERVICE))
                .setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + 5 * 60000, alarm);
            return;
        }
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Promemoria appuntamenti", NotificationManager.IMPORTANCE_HIGH);
            manager.createNotificationChannel(channel);
        }
        String id = intent.getStringExtra("id");
        String title = intent.getStringExtra("title");
        String detail = intent.getStringExtra("detail");
        if (title == null || title.isEmpty()) title = "Appuntamento";
        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        open.putExtra("reminder_id", id);
        PendingIntent pending = PendingIntent.getActivity(context, id == null ? 0 : id.hashCode(), open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent snooze = new Intent(context, ReminderReceiver.class);
        snooze.setAction("SNOOZE");
        snooze.putExtra("id", id);
        snooze.putExtra("title", title);
        snooze.putExtra("detail", detail);
        PendingIntent snoozePending = PendingIntent.getBroadcast(context, id == null ? 0 : id.hashCode(),
            snooze, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        int notificationId = id == null ? 1 : id.hashCode();
        android.app.Notification notification = new android.app.Notification.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle(title).setContentText(detail == null ? "" : detail)
            .setAutoCancel(true)
            .setContentIntent(pending).addAction(new android.app.Notification.Action.Builder(android.R.drawable.ic_popup_reminder, "RIMANDA 5 MIN", snoozePending).build()).addAction(new android.app.Notification.Action.Builder(android.R.drawable.ic_menu_view, "APRI", pending).build()).build();
        try { manager.notify(notificationId, notification); }
        catch (SecurityException ignored) { }
    }
}
