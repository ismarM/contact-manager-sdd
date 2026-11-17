package si.contactmanager.image;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Glavni program otroškega JVM z majhno kopico ({@code ImageProcessorMemoryTest}): hkrati obdela vse podane datoteke
 * (vsaka v svoji niti) in konča z 0, če nobena ne sproži {@code OutOfMemoryError} ali druge napake.
 */
final class MemoryProbe {

    private MemoryProbe() {}

    public static void main(String[] args) throws Exception {
        ImageProperties properties = new ImageProperties(
                5_242_880, 4096, 16_800_000, 2048, args.length, 30, 10, new ImageProperties.Google(List.of()));
        ImageProcessor processor = new ImageProcessor(properties);
        CountDownLatch start = new CountDownLatch(1);
        AtomicReference<Throwable> failure = new AtomicReference<>();
        Thread[] threads = new Thread[args.length];
        for (int i = 0; i < args.length; i++) {
            byte[] data = Files.readAllBytes(Path.of(args[i]));
            threads[i] = new Thread(() -> {
                try {
                    start.await();
                    ProcessedImage result = processor.process(data);
                    if (result.variants().size() != 3) {
                        throw new IllegalStateException("pričakovane tri različice");
                    }
                } catch (Throwable t) {
                    failure.compareAndSet(null, t);
                }
            });
            threads[i].start();
        }
        start.countDown();
        for (Thread thread : threads) {
            thread.join();
        }
        if (failure.get() != null) {
            failure.get().printStackTrace();
            System.exit(1);
        }
        System.out.println("OK");
    }
}
