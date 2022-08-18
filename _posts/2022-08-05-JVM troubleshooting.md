# Summary

This article introduces common JVM problems and corresponding trouble-shooting utils for Java programmers. We won’t dive into details, just a step-by-step guide on how to identify problems. 

There are some compound solutions like

- [useful scripts](https://github.com/oldratlee/useful-scripts/tree/release)
- [arthas](https://github.com/alibaba/arthas)

## The Crime Scene

It’s important to keep things in their place when bad things happened, so that we could later detect and study those cases and see where went wrong.

On production environment, the process might be terminated or updated to a newer version, or the problem just magically won’t reproduce, in that case we should  take snapshots of the `crime scene` and kept it for later analyze.

Here is a simple diagram for JVM related snapshots, which we depend on for specific problems later.


The common command lines to take a snapshot from a `running` JVM process:

| Type | Usage | Command |
| --- | --- | --- |
| HeapDump | Memory Leak, GC Problems | $JAVA_HOME/bin/jmap -dump:[live],format=b,file=<file-path> pid |
| GC log | GC Problems | Copy out the file -Xloggc:file specified |
| ThreadDump | CPU Usage Problem, Thread Dead Lock | $JAVA_HOM/bin/jstack -l pid |
|  |  |  |

# Checks

## 1. Check threads

`application thread` are all those java `Thread` we created from application level, we need to check if they are running actively without blocked by JVM management threads.

We could do the following steps:

- use `top` or `htop` command to check the process CPU utilization
- use `top -H` command to check each Java threads CPU utilization
- perform a `jstack` to get thread dump from running JVM, (The `nid` filed in jstack output is corresponding to the `top -H` output)
- use `iotop` to check disk write speed

And observe:

- Is `VMThread` running nearly 100% of CPU while all Application Threads are waiting? If so there might be a consecutive Full GC or safepoint issues.
- Is there a deadlock warning in `jstack` output?

- If application threads are running and occupied much of CPU resource, there might be a CPU utilization problem caused by dead loop.
- If application threads and VM Threads are both not CPU active, you should check the `iotop` disk write speed, and see if it’s caused by `GC log blocked by slow disk`
- If non of above scenarios met, you should pay attention to `compilation thread` and other tasks which might compete for resource on the same host

## 2. Check Memory Usage

Wait, why do I care where memories gone? 

Because this might cause multiple problems in your app, for example, excessive use out direct memory could get app killed by OS `oom hanlder`, memory leak from java heap might cause unbearable consecutive pause, too many threads could hurt performance and occupy unnecessary stack space.

So what should we do?

- Check process PhysMem and VirtualMem usage , especially `wired or pined` memories. we could use top and `cat /proc/${pid}/statm`
   
- Calculate the maximum memory use in theory from sum of  `Xmx`  `Maxmetaspacesize` `maxdirectmemorysize` , also the stack memory  `Xss` times number of all running Java threads.

The calculated value is nearly the maximum usage in theory, but normally JVM apply resource lazily if `-XX:+AlwaysPretouch` not enabled.

- Observe the GC log to identify abnormal GC activities
- Printout summary of heap status with `jmap -heap`  and `jmap -histo`
- Perform Heap dump of the running process

And observe:

- If the actual virtual memory in use is bigger than calculated memory, it’s likely the direct memory out of Java heap is leaking
- If GC log has Full Garbage Collection, look at cause, commonly categorized as

| Metaspace Triggered | Metaspace fragmented |
| --- | --- |
| Heap Triggered | Garbage collection could not keep up , or there is a memory leak |
| App Code Triggered  | Some code trigger System.gc() |

For those problems, upload the `heapdump` to a secure memory analyzer platform and take hints from the analyzer.

# Scenarios

Previously we take snapshots from the running process and analyzed possible cause, but those are all `hints` , how could we be sure about what went wrong?

In this section I will list common cases and reasons on what causing these problems, could serve as a lookup dictionary after the `Check` section.

Common issues could be categorized as:

- Application stalls
- Resource usage
- Observability
- Crash
- Normally problems are related, such as long application stalls could be caused by full garbage collection.
    
    

## [Full GC] Metaspace triggered

`Metaspace` is the information for class structure, class loaders, etc, it’s a separately managed out of heap space. 

If the `Metaspace` got too fragmented, a Full GC might occur, this is commonly caused by too many `class loaders` in a process.

`Why would I create that much class loaders?` , you might ask.

Well, the 3rd party app you depend on or some logic in your app might do this, for examples:

### Case: Reflection

Sometimes we use reflection to get dynamic information of a running objection or class, this is common in `serialization` 

JVM use profile guided optimization for reflection, on cold path it’s depend on a native based calling method to get internal information, on hot path it will construct a delegating class from a separate class loader to gain performance. The switch between cold&hot path is controlled by a `sun.reflect.inflationThreshold` option.

So check if your app has multiple hot reflection calls that fragmented the `Metaspace` , causing JVM Full GC.

- You could verify this by perform a heap dump, and check class loader number。
- Hint, you should avoid reflection since might hurt performance (inlining, break JIT)

### Case: ByteCode Generator

**`polymorphism`** is implemented by `invokevirtual` command, what if we need a more flexible calling resolution mechanism? 

Based on `invokedyamic` java support multiple calling resolution including calling groovy or other byte code base language scripts from java.

```java
static void runWithGroovyScriptEngine() throws Exception {
    Class scriptClass = new GroovyScriptEngine( "." ).loadScriptByName( "test.groovy" ) ;
    Object scriptInstance = scriptClass.newInstance() ;
    scriptClass.getDeclaredMethod( "hello_world", new Class[] {} ).invoke( scriptInstance, new Object[] {} ) ;
  }
```

The groovy script engine could be mapped to an underlying unique class loader, if not properly cached this method could generate tons of class loader.

- You could verify this by perform a heap dump, and check class loader number。

## [Full GC] Heap  memory leak

In heap memory leak is most common and risky case, sometimes the leak process will take a long time before it produces a sequence of FGC.

We could take a snapshot from process using heap dump, then analyze the suspects and determine their dominant root tree.

### Case: Incorrect pooling

Most objects will die young, incorrect pooling will unnecessarily prolong their life and bring more pressure to garbage collectors.

Common case is caching some objects that are not expensive to create, for example for db connections pooling is appropriate, but for some business internal data state, caching should be properly designed with a maximum cache limit.

### Case: Thread local scalability

Thread local storage is dangerous! You can’t be certain when a thread gets terminated, if using thread local storage with a thread pool, it’s possible to have `Thread pool worker number` multiplies `Thread local storage` duplicates of data.

And also, be aware of the references from local storage, as this will prolong referenced objects to at least as long as `Thread's life` .

## [Pause] consecutive pause

### Case: Biased locking (removed since 15)

Based on the assumption `most object monitor locks are used by a single thread throughout their life`, UseBiasedLocking improves performance.

But if assumptions broke, the JVM might need  lot of `safepoint` to readjust these locks to approximate state.

### Case: GC log triggered disk swapping

GC logs are written to disk file rather than RAM based `tmpfs` files,  the dirty page flushing policy when high IO load encountered will cause logging stalls.

Because it’s a synchronous operation in `safepoint`, this might bring long application stalls.

- `Xlog:async` enables async logging for GC, at expense of losing some in memory buffered logging.

### Case: Too much safe point

`Safepoint` is triggered at multiple operations, such as attaching, heap dump, thread dumps. Consecutive pauses could be caused by a frequent 3rd party operation, such as attaching the JVM for information every 1 second, or taking heapdump from time to time.

The pause time depends on the the type of job its running, heap dump will take a long time, while thread snapshots will take a rather shot time.

For JDK11+, the JVM brought `thread local handshake` to pause a single thread rather than stop the world, for example, if we want to get another thread’s running stack trace, only the snap shot thread will be paused.

## [Crash] where is my process?

### Case: Killed by system “OOM killer”

If your application suddenly disappears without application level exceptions  and errors, you should check if the running environment forced stopped this process.

If your process is occupying a lot of memory from direct heap while your system configured some maximum memory limit for a  process, this might force exit your overloaded program.

You could verify this by checking the `demsge` log and search `killed by oom`

### Case: Application crashed

Due to `Unsafe`  operations or some JVM internal bugs your process might exit and left a `coredump` and `hs_err` error log on your machine.
